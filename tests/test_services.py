"""Task services, global tags and events."""

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ServiceValidationError
from pytest_homeassistant_custom_component.common import (
    MockConfigEntry,
    async_capture_events,
)

from custom_components.tickoff.const import CONF_LIST_NAME, DOMAIN

ENTITY = "todo.tickoff_groceries"


async def _svc(hass, name, data, *, entity=True, response=False):
    payload = {"entity_id": ENTITY, **data} if entity else data
    return await hass.services.async_call(
        DOMAIN, name, payload, blocking=True, return_response=response
    )


async def _tasks(hass, **flt):
    resp = await _svc(hass, "get_tasks", flt, response=True)
    return resp[ENTITY]["tasks"]


async def test_add_task_with_priority_and_tags(hass, setup_entry):
    resp = await _svc(
        hass, "add_task",
        {"title": "Mow", "priority": 3, "tags": ["garden", "Weekend"], "due_date": "2026-12-01",
         "due_time": "09:00:00", "notes": "front + back"},
        response=True,
    )
    task = resp[ENTITY]["task"]
    assert task["priority"] == 3
    assert task["tags"] == ["garden", "Weekend"]
    assert task["due_time"] == "09:00"
    assert hass.states.get(ENTITY).state == "1"
    (tag_resp,) = [await _svc(hass, "get_tags", {}, entity=False, response=True)]
    assert set(tag_resp["tags"]) == {"garden", "Weekend"}


async def test_invalid_priority_rejected(hass, setup_entry):
    with pytest.raises(Exception, match="(?i)priority|value|range"):
        await _svc(hass, "add_task", {"title": "x", "priority": 9})


async def test_update_keeps_other_fields_and_clears_due(hass, setup_entry):
    resp = await _svc(hass, "add_task",
                      {"title": "Mow", "priority": 2, "tags": ["garden"], "due_date": "2026-12-01"},
                      response=True)
    tid = resp[ENTITY]["task"]["id"]
    await _svc(hass, "update_task", {"task_id": tid, "title": "Mow lawn"})
    (task,) = await _tasks(hass)
    assert (task["title"], task["priority"], task["tags"], task["due_date"]) == (
        "Mow lawn", 2, ["garden"], "2026-12-01")
    await _svc(hass, "update_task", {"task_id": tid, "due_date": None, "tags": []})
    (task,) = await _tasks(hass)
    assert task["due_date"] is None and task["tags"] == []


async def test_todo_entity_edit_keeps_priority_and_tags(hass, setup_entry):
    resp = await _svc(hass, "add_task", {"title": "Mow", "priority": 3, "tags": ["garden"]},
                      response=True)
    await hass.services.async_call(
        "todo", "update_item", {"entity_id": ENTITY, "item": "Mow", "rename": "Mow lawn"},
        blocking=True)
    (task,) = await _tasks(hass)
    assert task["id"] == resp[ENTITY]["task"]["id"]
    assert (task["title"], task["priority"], task["tags"]) == ("Mow lawn", 3, ["garden"])


async def test_complete_reopen_delete_and_unknown(hass, setup_entry):
    resp = await _svc(hass, "add_task", {"title": "A"}, response=True)
    tid = resp[ENTITY]["task"]["id"]
    await _svc(hass, "complete_task", {"task_id": tid})
    (task,) = await _tasks(hass, status="done")
    assert task["completed_at"] is not None
    assert await _tasks(hass, status="open") == []
    await _svc(hass, "reopen_task", {"task_id": tid})
    assert (await _tasks(hass, status="open"))[0]["completed_at"] is None
    await _svc(hass, "delete_task", {"task_id": tid})
    assert await _tasks(hass) == []
    with pytest.raises(ServiceValidationError):
        await _svc(hass, "complete_task", {"task_id": "nope"})


async def test_get_tasks_filter_by_tag_case_insensitive(hass, setup_entry):
    await _svc(hass, "add_task", {"title": "A", "tags": ["Garden"]})
    await _svc(hass, "add_task", {"title": "B", "tags": ["home"]})
    assert [t["title"] for t in await _tasks(hass, tag="garden")] == ["A"]


async def test_events(hass, setup_entry):
    created = async_capture_events(hass, "tickoff_task_created")
    completed = async_capture_events(hass, "tickoff_task_completed")
    reopened = async_capture_events(hass, "tickoff_task_reopened")
    resp = await _svc(hass, "add_task", {"title": "A", "priority": 1, "tags": ["x"]}, response=True)
    tid = resp[ENTITY]["task"]["id"]
    await _svc(hass, "complete_task", {"task_id": tid})
    await _svc(hass, "complete_task", {"task_id": tid})  # no second event
    await _svc(hass, "reopen_task", {"task_id": tid})
    await hass.async_block_till_done()
    assert len(created) == len(completed) == len(reopened) == 1
    data = created[0].data
    assert data["list_name"] == "Groceries" and data["task_id"] == tid
    assert data["priority"] == 1 and data["tags"] == ["x"]


async def test_events_from_todo_entity_path(hass, setup_entry):
    completed = async_capture_events(hass, "tickoff_task_completed")
    await hass.services.async_call("todo", "add_item", {"entity_id": ENTITY, "item": "A"}, blocking=True)
    await hass.services.async_call(
        "todo", "update_item", {"entity_id": ENTITY, "item": "A", "status": "completed"}, blocking=True)
    await hass.async_block_till_done()
    assert len(completed) == 1


# ---- global tag register ----

async def test_tag_colors_rename_delete_across_lists(hass: HomeAssistant, setup_entry):
    second = MockConfigEntry(domain=DOMAIN, title="Chores", unique_id="chores",
                             data={CONF_LIST_NAME: "Chores"})
    second.add_to_hass(hass)
    await hass.config_entries.async_setup(second.entry_id)
    await hass.async_block_till_done()
    other = "todo.tickoff_chores"

    await _svc(hass, "add_task", {"title": "A", "tags": ["garden"]})
    await hass.services.async_call(
        DOMAIN, "add_task", {"entity_id": other, "title": "B", "tags": ["GARDEN", "home"]},
        blocking=True)
    # one global register: "garden" only exists once, first spelling wins
    tags = (await _svc(hass, "get_tags", {}, entity=False, response=True))["tags"]
    assert set(tags) == {"garden", "home"}
    assert tags["garden"]["color"] != tags["home"]["color"]

    await _svc(hass, "set_tag", {"name": "garden", "color": "#2E7D32"}, entity=False)
    tags = (await _svc(hass, "get_tags", {}, entity=False, response=True))["tags"]
    assert tags["garden"]["color"] == "#2e7d32"

    await _svc(hass, "rename_tag", {"name": "garden", "new_name": "yard"}, entity=False)
    assert (await _tasks(hass))[0]["tags"] == ["yard"]
    resp = await hass.services.async_call(
        DOMAIN, "get_tasks", {"entity_id": other}, blocking=True, return_response=True)
    assert resp[other]["tasks"][0]["tags"] == ["yard", "home"]

    await _svc(hass, "delete_tag", {"name": "yard"}, entity=False)
    assert (await _tasks(hass))[0]["tags"] == []
    resp = await hass.services.async_call(
        DOMAIN, "get_tasks", {"entity_id": other}, blocking=True, return_response=True)
    assert resp[other]["tasks"][0]["tags"] == ["home"]


async def test_rename_to_existing_tag_fails(hass, setup_entry):
    await _svc(hass, "set_tag", {"name": "a", "color": "#111111"}, entity=False)
    await _svc(hass, "set_tag", {"name": "b", "color": "#222222"}, entity=False)
    with pytest.raises(ServiceValidationError):
        await _svc(hass, "rename_tag", {"name": "a", "new_name": "B"}, entity=False)
    with pytest.raises(ServiceValidationError):
        await _svc(hass, "delete_tag", {"name": "zzz"}, entity=False)


async def test_bad_color_rejected(hass, setup_entry):
    with pytest.raises(Exception):  # noqa: B017 - schema error type varies
        await _svc(hass, "set_tag", {"name": "a", "color": "red"}, entity=False)


async def test_tags_persist_across_reload(hass, setup_entry):
    await _svc(hass, "add_task", {"title": "A", "tags": ["garden"]})
    await _svc(hass, "set_tag", {"name": "garden", "color": "#123456"}, entity=False)
    await hass.config_entries.async_reload(setup_entry.entry_id)
    await hass.async_block_till_done()
    assert (await _tasks(hass))[0]["tags"] == ["garden"]
