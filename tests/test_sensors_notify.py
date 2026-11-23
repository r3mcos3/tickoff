"""Sensors, due-date notifier, notification targets (incl. Telegram), websocket API."""

from datetime import timedelta

from homeassistant.helpers import entity_registry as er
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import (
    MockConfigEntry,
    async_capture_events,
    async_fire_time_changed,
    async_mock_service,
    mock_registry,
)

from custom_components.tickoff.const import DOMAIN
from custom_components.tickoff.hub import async_get_hub
from custom_components.tickoff.notify import async_notify_targets

ENTITY = "todo.tickoff"


async def svc(hass, name, data, *, entity=ENTITY, response=False):
    payload = {"entity_id": entity, **data} if entity else data
    return await hass.services.async_call(DOMAIN, name, payload, blocking=True, return_response=response)


async def add(hass, **data):
    return (await svc(hass, "add_task", data, response=True))[ENTITY]["task"]


async def utc(hass):
    await hass.config.async_set_time_zone("UTC")


def set_targets(hass, entry, targets, **extra):
    hass.config_entries.async_update_entry(entry, options={"notify_targets": targets, **extra})


async def test_entities_have_plain_names(hass, setup_entry):
    assert hass.states.get("todo.tickoff").attributes["friendly_name"] == "Tickoff"
    for kind in ("open", "today", "overdue"):
        assert hass.states.get(f"sensor.tickoff_{kind}") is not None
    # a single entry: no overview, no per-list sensors
    assert len(hass.config_entries.async_entries(DOMAIN)) == 1


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
    assert hass.states.get("sensor.tickoff_open").state == "6"
    assert hass.states.get("sensor.tickoff_today").state == "2"
    assert hass.states.get("sensor.tickoff_overdue").state == "2"
    titles = [t["title"] for t in hass.states.get("sensor.tickoff_overdue").attributes["tasks"]]
    assert titles == ["late", "today, time passed"]
    # the clock moves a task from today to overdue without any edit
    freezer.move_to("2026-03-10 19:00:00")
    async_fire_time_changed(hass, dt_util.utcnow(), fire_all=True)
    await hass.async_block_till_done()
    assert hass.states.get("sensor.tickoff_overdue").state == "3"
    assert hass.states.get("sensor.tickoff_today").state == "1"


# ---- notifier ----

async def test_notifies_once_at_0800_for_task_without_time(hass, setup_entry, freezer):
    await utc(hass)
    freezer.move_to("2026-03-09 20:00:00")
    calls = async_mock_service(hass, "notify", "phone")
    events = async_capture_events(hass, "tickoff_task_due")
    set_targets(hass, setup_entry, ["service:phone"])
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
    assert calls[0].data == {"title": "Tickoff", "message": "Pay rent"}
    assert len(events) == 1 and events[0].data["title"] == "Pay rent"


async def test_notifies_telegram_entity_through_send_message(hass, setup_entry, freezer):
    """The Telegram bot integration creates a notify *entity*; it is reached via notify.send_message."""
    await utc(hass)
    freezer.move_to("2026-03-09 20:00:00")
    sent = async_mock_service(hass, "notify", "send_message")
    phone = async_mock_service(hass, "notify", "phone")
    set_targets(hass, setup_entry, ["entity:notify.telegram_chat", "service:phone"])
    await add(hass, title="Call", due_date="2026-03-10", due_time="15:30:00")
    freezer.move_to("2026-03-10 15:30:00")
    assert await async_get_hub(hass).async_check_due() == 1
    await hass.async_block_till_done()
    assert len(sent) == 1 and sent[0].data == {
        "entity_id": "notify.telegram_chat", "title": "Tickoff", "message": "Call (15:30)"}
    assert len(phone) == 1  # every chosen target gets the message


async def test_one_broken_target_does_not_stop_the_others(hass, setup_entry, freezer, caplog):
    await utc(hass)
    freezer.move_to("2026-03-09 20:00:00")
    good = async_mock_service(hass, "notify", "good")
    set_targets(hass, setup_entry, ["service:gone", "service:good"])
    await add(hass, title="x", due_date="2026-03-10")
    freezer.move_to("2026-03-10 08:00:00")
    assert await async_get_hub(hass).async_check_due() == 1
    assert len(good) == 1
    assert "service:gone is not available" in caplog.text


async def test_notify_time_option(hass, setup_entry, freezer):
    await utc(hass)
    freezer.move_to("2026-03-09 20:00:00")
    calls = async_mock_service(hass, "notify", "phone")
    set_targets(hass, setup_entry, ["service:phone"], notify_time="07:30:00")
    await add(hass, title="uses default time", due_date="2026-03-10")
    hub = async_get_hub(hass)
    freezer.move_to("2026-03-10 07:29:00")
    assert await hub.async_check_due() == 0
    freezer.move_to("2026-03-10 07:30:00")
    assert await hub.async_check_due() == 1
    await hass.async_block_till_done()
    assert len(calls) == 1


async def test_notified_marker_survives_restart(hass, setup_entry, freezer):
    await utc(hass)
    freezer.move_to("2026-03-09 20:00:00")
    await add(hass, title="Pay rent", due_date="2026-03-10")
    freezer.move_to("2026-03-10 08:05:00")
    assert await async_get_hub(hass).async_check_due() == 1
    await hass.config_entries.async_reload(setup_entry.entry_id)
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
    await svc(hass, "complete_task", {"task_id": t["id"]})
    freezer.move_to("2026-03-11 08:00:00")
    assert await hub.async_check_due() == 1


async def test_done_tasks_do_not_notify_and_event_fires_without_targets(hass, setup_entry, freezer):
    await utc(hass)
    freezer.move_to("2026-03-09 20:00:00")
    t = await add(hass, title="a", due_date="2026-03-10")
    await add(hass, title="b", due_date="2026-03-10")
    await svc(hass, "complete_task", {"task_id": t["id"]})
    events = async_capture_events(hass, "tickoff_task_due")
    freezer.move_to("2026-03-10 08:00:00")
    assert await async_get_hub(hass).async_check_due() == 1
    await hass.async_block_till_done()
    assert [e.data["title"] for e in events] == ["b"]


async def test_periodic_timer_runs_the_check(hass, setup_entry, freezer):
    await utc(hass)
    freezer.move_to("2026-03-09 20:00:00")
    events = async_capture_events(hass, "tickoff_task_due")
    await add(hass, title="x", due_date="2026-03-10")
    freezer.move_to("2026-03-10 08:00:30")
    async_fire_time_changed(hass, dt_util.utcnow() + timedelta(minutes=1, seconds=1), fire_all=True)
    await hass.async_block_till_done()
    assert len(events) == 1


# ---- target discovery (Telegram first) ----

async def test_targets_list_services_and_entities_with_telegram_first(hass, setup_entry):
    async_mock_service(hass, "notify", "mobile_app_phone")
    async_mock_service(hass, "notify", "telegram_family")
    async_mock_service(hass, "notify", "send_message")  # generic service is not a target
    registry = er.async_get(hass)
    registry.async_get_or_create("notify", "telegram_bot", "123", suggested_object_id="home_assistant_remco_123")
    hass.states.async_set("notify.home_assistant_remco_123", "unknown", {"friendly_name": "Home Assistant Remco"})
    hass.states.async_set("notify.other_entity", "unknown", {"friendly_name": "Other"})

    targets = async_notify_targets(hass, keep=["service:vanished"])
    values = [t["value"] for t in targets]
    assert "service:send_message" not in values
    by = {t["value"]: t for t in targets}
    assert by["entity:notify.home_assistant_remco_123"]["telegram"] is True  # recognised by its platform
    assert by["entity:notify.home_assistant_remco_123"]["label"] == "Telegram · Home Assistant Remco"
    assert by["service:telegram_family"]["telegram"] is True
    assert by["entity:notify.other_entity"]["telegram"] is False
    assert [t["telegram"] for t in targets] == sorted((t["telegram"] for t in targets), reverse=True)  # Telegram on top
    assert by["service:vanished"]["label"].endswith("(unavailable)")  # a saved choice is never silently lost


# ---- websocket ----

async def test_websocket_snapshot_and_subscribe(hass, hass_ws_client, setup_entry):
    await add(hass, title="Mow", priority=2, tags=["garden"], subtasks=["front"])
    client = await hass_ws_client(hass)
    await client.send_json({"id": 1, "type": "tickoff/snapshot"})
    snap = (await client.receive_json())["result"]
    assert snap["entity_id"] == ENTITY
    assert snap["tasks"][0]["title"] == "Mow" and snap["tasks"][0]["state"] == "no_date"
    assert "garden" in snap["tags"] and "lists" not in snap
    assert snap["settings"] == {"notify_targets": [], "notify_time": "08:00:00"}

    await client.send_json({"id": 2, "type": "tickoff/subscribe"})
    assert (await client.receive_json())["success"]
    first = await client.receive_json()
    assert first["type"] == "event" and first["event"]["tasks"][0]["title"] == "Mow"
    await add(hass, title="Second")
    pushed = await client.receive_json()
    assert [t["title"] for t in pushed["event"]["tasks"]][-1] == "Second"
    await svc(hass, "set_tag", {"name": "garden", "color": "#112233"}, entity=None)
    pushed = await client.receive_json()
    assert pushed["event"]["tags"]["garden"]["color"] == "#112233"


async def ws(client, id_, payload):
    await client.send_json({"id": id_, **payload})
    return await client.receive_json()


async def test_settings_roundtrip_and_test_notification(hass, hass_ws_client, setup_entry):
    sent = async_mock_service(hass, "notify", "send_message")
    hass.states.async_set("notify.chat", "unknown", {"friendly_name": "Telegram chat"})
    client = await hass_ws_client(hass)
    none = await ws(client, 1, {"type": "tickoff/test_notify"})
    assert none["error"]["code"] == "no_targets"

    ok = await ws(client, 2, {"type": "tickoff/settings_set",
                              "notify_targets": ["entity:notify.chat", "entity:notify.chat"], "notify_time": "07:15:00"})
    assert ok["success"]
    snap = (await ws(client, 3, {"type": "tickoff/snapshot"}))["result"]
    assert snap["settings"] == {"notify_targets": ["entity:notify.chat"], "notify_time": "07:15:00"}
    chat = next(t for t in snap["notify_targets"] if t["value"] == "entity:notify.chat")
    assert chat["telegram"] is True  # "Telegram chat" friendly name

    test = await ws(client, 4, {"type": "tickoff/test_notify"})
    assert test["result"] == {"sent": 1, "targets": 1}
    assert sent[0].data["entity_id"] == "notify.chat" and "Test" in sent[0].data["message"]

    bad = await ws(client, 5, {"type": "tickoff/settings_set", "notify_time": "soon"})
    assert bad["error"]["code"] == "invalid_time"
    await ws(client, 6, {"type": "tickoff/settings_set", "notify_targets": []})
    assert (await ws(client, 7, {"type": "tickoff/snapshot"}))["result"]["settings"]["notify_targets"] == []


async def test_settings_require_admin(hass, hass_ws_client, hass_admin_user, setup_entry):
    hass_admin_user.groups = []
    client = await hass_ws_client(hass)
    for i, payload in enumerate(({"type": "tickoff/settings_set", "notify_targets": []}, {"type": "tickoff/test_notify"})):
        msg = await ws(client, i + 1, payload)
        assert not msg["success"] and msg["error"]["code"] == "unauthorized"
    assert (await ws(client, 9, {"type": "tickoff/snapshot"}))["success"]


async def test_panel_registered_and_files_served(hass, hass_client, setup_entry):
    from homeassistant.components.frontend import DATA_PANELS

    panel = hass.data[DATA_PANELS]["tickoff"]
    assert panel.sidebar_title == "Tickoff" and panel.require_admin is False
    client = await hass_client()
    for name in ("tickoff-panel.js", "tickoff-card.js"):
        assert (await client.get(f"/tickoff_static/{name}")).status == 200


# ---- migration from the multi-list versions ----

async def test_migrates_lists_into_one_collection(hass):
    from homeassistant.helpers.storage import Store

    def entry(title, kind, **options):
        data = {"name": title, "kind": "list"} if kind == "list" else {"kind": "overview"}
        e = MockConfigEntry(domain=DOMAIN, title=title, unique_id=title.lower(), data=data, options=options)
        e.add_to_hass(hass)
        return e

    first = entry("Groceries", "list", notify_service="mine")
    second = entry("Chores", "list")
    overview = entry("Tickoff", "overview", notify_service="family", notify_time="07:30:00")

    def task(id_, title, pos, **kw):
        return {"id": id_, "title": title, "notes": "", "due_date": None, "due_time": None, "priority": 0,
                "tags": [], "status": "open", "completed_at": None, "position": pos, "created_at": "x",
                "updated_at": "x", **kw}

    await Store(hass, 1, f"tickoff.{first.entry_id}").async_save({"tasks": [task("a", "Milk", 1), task("b", "Eggs", 0)]})
    await Store(hass, 1, f"tickoff.{second.entry_id}").async_save({"tasks": [task("c", "Vacuum", 0)]})
    registry = mock_registry(hass)
    registry.async_get_or_create("todo", DOMAIN, first.entry_id, suggested_object_id="tickoff_groceries", config_entry=first)
    registry.async_get_or_create("sensor", DOMAIN, f"{first.entry_id}_open", suggested_object_id="tickoff_groceries_open", config_entry=first)
    registry.async_get_or_create("sensor", DOMAIN, f"{overview.entry_id}_open", suggested_object_id="tickoff_open", config_entry=overview)

    assert await hass.config_entries.async_setup(first.entry_id)
    await hass.async_block_till_done()

    entries = hass.config_entries.async_entries(DOMAIN)
    assert len(entries) == 1 and entries[0].data == {"kind": "main"} and entries[0].title == "Tickoff"
    assert entries[0].options == {"notify_targets": ["service:mine", "service:family"], "notify_time": "07:30:00"}
    resp = await hass.services.async_call(DOMAIN, "get_tasks", {"entity_id": "todo.tickoff"}, blocking=True, return_response=True)
    assert [t["title"] for t in resp["todo.tickoff"]["tasks"]] == ["Eggs", "Milk", "Vacuum"]  # order kept, lists merged
    assert hass.states.get("sensor.tickoff_open") is not None
    assert hass.states.get("todo.tickoff_groceries") is None


async def test_migration_of_only_an_overview_entry(hass):
    e = MockConfigEntry(domain=DOMAIN, title="Tickoff", unique_id="overview", data={"kind": "overview"},
                        options={"notify_service": "family"})
    e.add_to_hass(hass)
    assert await hass.config_entries.async_setup(e.entry_id)
    await hass.async_block_till_done()
    (only,) = hass.config_entries.async_entries(DOMAIN)
    assert only.data == {"kind": "main"} and only.options == {"notify_targets": ["service:family"]}
    assert hass.states.get("todo.tickoff") is not None
