"""Overview entry, sensors, due-date notifier, notify settings, websocket snapshot."""

from datetime import timedelta

from homeassistant.config_entries import ConfigEntryState
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import (
    MockConfigEntry,
    async_capture_events,
    async_fire_time_changed,
    async_mock_service,
)

from custom_components.tickoff.const import CONF_LIST_NAME, DOMAIN
from custom_components.tickoff.hub import async_get_hub

ENTITY = "todo.tickoff_groceries"


async def svc(hass, name, data, *, entity=ENTITY, response=False):
    payload = {"entity_id": entity, **data} if entity else data
    return await hass.services.async_call(DOMAIN, name, payload, blocking=True, return_response=response)


async def add(hass, **data):
    return (await svc(hass, "add_task", data, response=True))[ENTITY]["task"]


async def utc(hass):
    await hass.config.async_set_time_zone("UTC")


async def test_overview_entry_created_automatically(hass, setup_entry):
    await hass.async_block_till_done()
    kinds = [e.data.get("kind") for e in hass.config_entries.async_entries(DOMAIN)]
    assert sorted(kinds) == ["list", "overview"]
    assert hass.states.get("sensor.tickoff_open") is not None
    assert hass.states.get("sensor.tickoff_groceries_open") is not None


async def test_only_one_overview_with_two_lists(hass, setup_entry):
    second = MockConfigEntry(domain=DOMAIN, title="Chores", unique_id="chores",
                             data={CONF_LIST_NAME: "Chores", "kind": "list"})
    second.add_to_hass(hass)
    await hass.config_entries.async_setup(second.entry_id)
    await hass.async_block_till_done()
    assert [e.data.get("kind") for e in hass.config_entries.async_entries(DOMAIN)].count("overview") == 1


async def test_counts_open_today_overdue(hass, setup_entry, freezer):
    await utc(hass)
    freezer.move_to("2026-03-10 12:00:00")
    await add(hass, title="no date")
    await add(hass, title="late", due_date="2026-03-09")
    await add(hass, title="today", due_date="2026-03-10")
    await add(hass, title="today, time passed", due_date="2026-03-10", due_time="09:00:00")
    await add(hass, title="today, time to come", due_date="2026-03-10", due_time="18:00:00")
    await add(hass, title="later", due_date="2026-03-11")
    done = await add(hass, title="done", due_date="2026-03-09")
    await svc(hass, "complete_task", {"task_id": done["id"]})
    await hass.async_block_till_done()
    assert hass.states.get("sensor.tickoff_groceries_open").state == "6"
    assert hass.states.get("sensor.tickoff_groceries_today").state == "2"
    assert hass.states.get("sensor.tickoff_groceries_overdue").state == "2"
    # overview mirrors the list while there is just one
    assert hass.states.get("sensor.tickoff_overdue").state == "2"
    titles = [t["title"] for t in hass.states.get("sensor.tickoff_overdue").attributes["tasks"]]
    assert titles == ["late", "today, time passed"]
    # the clock moves a task from today to overdue without any edit
    freezer.move_to("2026-03-10 19:00:00")
    async_fire_time_changed(hass, dt_util.utcnow(), fire_all=True)  # minute tick
    await hass.async_block_till_done()
    assert hass.states.get("sensor.tickoff_groceries_overdue").state == "3"
    assert hass.states.get("sensor.tickoff_groceries_today").state == "1"


async def test_overview_totals_over_all_lists(hass, setup_entry):
    second = MockConfigEntry(domain=DOMAIN, title="Chores", unique_id="chores",
                             data={CONF_LIST_NAME: "Chores", "kind": "list"})
    second.add_to_hass(hass)
    await hass.config_entries.async_setup(second.entry_id)
    await hass.async_block_till_done()
    await add(hass, title="a")
    await svc(hass, "add_task", {"title": "b"}, entity="todo.tickoff_chores")
    await hass.async_block_till_done()
    assert hass.states.get("sensor.tickoff_open").state == "2"
    assert hass.states.get("sensor.tickoff_groceries_open").state == "1"


# ---- notifier ----

async def test_notifies_once_at_0800_for_task_without_time(hass, setup_entry, freezer):
    await utc(hass)
    freezer.move_to("2026-03-09 20:00:00")
    calls = async_mock_service(hass, "notify", "phone")
    events = async_capture_events(hass, "tickoff_task_due")
    result = await hass.config_entries.options.async_init(setup_entry.entry_id)
    await hass.config_entries.options.async_configure(result["flow_id"], {"notify_service": "phone"})
    await hass.async_block_till_done()
    await add(hass, title="Pay rent", due_date="2026-03-10")
    hub = async_get_hub(hass)

    freezer.move_to("2026-03-10 07:59:00")
    assert await hub.async_check_due() == 0
    freezer.move_to("2026-03-10 08:00:00")
    assert await hub.async_check_due() == 1
    assert await hub.async_check_due() == 0  # de-duplicated
    freezer.move_to("2026-03-10 14:00:00")
    assert await hub.async_check_due() == 0
    await hass.async_block_till_done()
    assert len(calls) == 1
    assert calls[0].data == {"title": "Tickoff · Groceries", "message": "Pay rent"}
    assert len(events) == 1 and events[0].data["title"] == "Pay rent"


async def test_notifies_at_set_time(hass, setup_entry, freezer):
    await utc(hass)
    freezer.move_to("2026-03-09 20:00:00")
    calls = async_mock_service(hass, "notify", "phone")
    result = await hass.config_entries.options.async_init(setup_entry.entry_id)
    await hass.config_entries.options.async_configure(result["flow_id"], {"notify_service": "phone"})
    await hass.async_block_till_done()
    await add(hass, title="Call", due_date="2026-03-10", due_time="15:30:00")
    hub = async_get_hub(hass)
    freezer.move_to("2026-03-10 08:30:00")
    assert await hub.async_check_due() == 0  # 08:00 does not apply to a timed task
    freezer.move_to("2026-03-10 15:30:00")
    assert await hub.async_check_due() == 1
    await hass.async_block_till_done()
    assert calls[0].data["message"] == "Call (15:30)"


async def test_notified_marker_survives_restart(hass, setup_entry, freezer):
    await utc(hass)
    freezer.move_to("2026-03-09 20:00:00")
    await add(hass, title="Pay rent", due_date="2026-03-10")
    hub = async_get_hub(hass)
    freezer.move_to("2026-03-10 08:05:00")
    assert await hub.async_check_due() == 1
    await hass.config_entries.async_reload(setup_entry.entry_id)  # flushes the store, reloads
    await hass.async_block_till_done()
    assert await async_get_hub(hass).async_check_due() == 0


async def test_task_added_after_trigger_time_is_silent(hass, setup_entry, freezer):
    await utc(hass)
    freezer.move_to("2026-03-10 10:00:00")
    await add(hass, title="Just added", due_date="2026-03-10")
    assert await async_get_hub(hass).async_check_due() == 0


async def test_snoozed_task_notifies_tomorrow(hass, setup_entry, freezer):
    await utc(hass)
    freezer.move_to("2026-03-10 07:00:00")
    t = await add(hass, title="Later", due_date="2026-03-10")
    hub = async_get_hub(hass)
    freezer.move_to("2026-03-10 08:00:00")
    assert await hub.async_check_due() == 1
    freezer.move_to("2026-03-10 09:00:00")
    await svc(hass, "snooze_task", {"task_id": t["id"]})
    freezer.move_to("2026-03-11 08:00:00")
    assert await hub.async_check_due() == 1


async def test_recurring_task_notifies_again_next_occurrence(hass, setup_entry, freezer):
    await utc(hass)
    freezer.move_to("2026-03-09 20:00:00")
    t = await add(hass, title="Trash", due_date="2026-03-10", recurrence={"type": "daily"})
    hub = async_get_hub(hass)
    freezer.move_to("2026-03-10 08:00:00")
    assert await hub.async_check_due() == 1
    await svc(hass, "complete_task", {"task_id": t["id"]})  # rolls to the 11th
    freezer.move_to("2026-03-11 08:00:00")
    assert await hub.async_check_due() == 1


async def test_done_tasks_do_not_notify_and_event_fires_without_service(hass, setup_entry, freezer):
    await utc(hass)
    freezer.move_to("2026-03-09 20:00:00")
    t = await add(hass, title="a", due_date="2026-03-10")
    await add(hass, title="b", due_date="2026-03-10")
    await svc(hass, "complete_task", {"task_id": t["id"]})
    events = async_capture_events(hass, "tickoff_task_due")
    freezer.move_to("2026-03-10 08:00:00")
    assert await async_get_hub(hass).async_check_due() == 1
    await hass.async_block_till_done()
    assert [e.data["title"] for e in events] == ["b"]  # no notify service configured: event only


async def test_global_default_service_and_per_list_override(hass, setup_entry, freezer):
    await utc(hass)
    default_calls = async_mock_service(hass, "notify", "family")
    own_calls = async_mock_service(hass, "notify", "mine")
    await hass.async_block_till_done()
    overview = next(e for e in hass.config_entries.async_entries(DOMAIN) if e.data.get("kind") == "overview")
    result = await hass.config_entries.options.async_init(overview.entry_id)
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {"notify_service": "family", "notify_time": "07:30:00"})
    assert overview.options == {"notify_service": "family", "notify_time": "07:30:00"}
    freezer.move_to("2026-03-09 20:00:00")
    await add(hass, title="uses default", due_date="2026-03-10")
    hub = async_get_hub(hass)
    freezer.move_to("2026-03-10 07:29:00")
    assert await hub.async_check_due() == 0
    freezer.move_to("2026-03-10 07:30:00")
    assert await hub.async_check_due() == 1
    await hass.async_block_till_done()
    assert len(default_calls) == 1 and not own_calls

    result = await hass.config_entries.options.async_init(setup_entry.entry_id)
    await hass.config_entries.options.async_configure(result["flow_id"], {"notify_service": "mine"})
    await hass.async_block_till_done()
    freezer.move_to("2026-03-10 20:00:00")
    await add(hass, title="uses own", due_date="2026-03-11")
    freezer.move_to("2026-03-11 07:30:00")
    assert await async_get_hub(hass).async_check_due() == 1
    await hass.async_block_till_done()
    assert len(own_calls) == 1 and len(default_calls) == 1


async def test_missing_notify_service_does_not_crash(hass, setup_entry, freezer, caplog):
    await utc(hass)
    result = await hass.config_entries.options.async_init(setup_entry.entry_id)
    await hass.config_entries.options.async_configure(result["flow_id"], {"notify_service": "gone"})
    await hass.async_block_till_done()
    freezer.move_to("2026-03-09 20:00:00")
    await add(hass, title="x", due_date="2026-03-10")
    freezer.move_to("2026-03-10 08:00:00")
    assert await async_get_hub(hass).async_check_due() == 1
    assert "notify.gone not found" in caplog.text


async def test_periodic_timer_runs_the_check(hass, setup_entry, freezer):
    await utc(hass)
    freezer.move_to("2026-03-09 20:00:00")
    events = async_capture_events(hass, "tickoff_task_due")
    await add(hass, title="x", due_date="2026-03-10")
    freezer.move_to("2026-03-10 08:00:30")
    async_fire_time_changed(hass, dt_util.utcnow() + timedelta(minutes=1, seconds=1), fire_all=True)
    await hass.async_block_till_done()
    assert len(events) == 1


# ---- websocket ----

async def test_websocket_snapshot_and_subscribe(hass, hass_ws_client, setup_entry):
    await add(hass, title="Mow", priority=2, tags=["garden"], subtasks=["front"])
    client = await hass_ws_client(hass)
    await client.send_json({"id": 1, "type": "tickoff/snapshot"})
    msg = await client.receive_json()
    snap = msg["result"]
    (lst,) = snap["lists"]
    assert lst["entity_id"] == ENTITY and lst["name"] == "Groceries"
    assert lst["tasks"][0]["title"] == "Mow" and lst["tasks"][0]["state"] == "no_date"
    assert "garden" in snap["tags"]

    await client.send_json({"id": 2, "type": "tickoff/subscribe"})
    assert (await client.receive_json())["success"]
    first = await client.receive_json()
    assert first["type"] == "event" and first["event"]["lists"][0]["tasks"][0]["title"] == "Mow"
    await add(hass, title="Second")
    pushed = await client.receive_json()
    assert [t["title"] for t in pushed["event"]["lists"][0]["tasks"]][-1] == "Second"
    await svc(hass, "set_tag", {"name": "garden", "color": "#112233"}, entity=None)
    pushed = await client.receive_json()
    assert pushed["event"]["tags"]["garden"]["color"] == "#112233"


# ---- tags in lists that are not loaded ----

async def test_tag_rename_and_delete_reach_unloaded_lists(hass, setup_entry):
    second = MockConfigEntry(domain=DOMAIN, title="Chores", unique_id="chores",
                             data={CONF_LIST_NAME: "Chores", "kind": "list"})
    second.add_to_hass(hass)
    await hass.config_entries.async_setup(second.entry_id)
    await hass.async_block_till_done()
    await svc(hass, "add_task", {"title": "B", "tags": ["garden", "home"]}, entity="todo.tickoff_chores")
    await hass.config_entries.async_unload(second.entry_id)  # flushes to disk
    await hass.async_block_till_done()
    assert second.state is ConfigEntryState.NOT_LOADED

    await svc(hass, "rename_tag", {"name": "garden", "new_name": "yard"}, entity=None)
    await svc(hass, "delete_tag", {"name": "home"}, entity=None)

    await hass.config_entries.async_setup(second.entry_id)
    await hass.async_block_till_done()
    resp = await svc(hass, "get_tasks", {}, entity="todo.tickoff_chores", response=True)
    assert resp["todo.tickoff_chores"]["tasks"][0]["tags"] == ["yard"]
