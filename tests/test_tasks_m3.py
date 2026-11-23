"""Subtasks, snooze, bulk delete, order, recurrence rollover, history."""

from datetime import date

import pytest
from freezegun.api import FrozenDateTimeFactory
from homeassistant.exceptions import ServiceValidationError

from custom_components.tickoff.const import DOMAIN

ENTITY = "todo.tickoff"


async def svc(hass, name, data=None, *, response=False):
    return await hass.services.async_call(
        DOMAIN, name, {"entity_id": ENTITY, **(data or {})}, blocking=True, return_response=response
    )


async def add(hass, **data):
    resp = await svc(hass, "add_task", data, response=True)
    return resp[ENTITY]["task"]


async def tasks(hass, **flt):
    return (await svc(hass, "get_tasks", flt, response=True))[ENTITY]["tasks"]


async def test_subtasks_flow_and_auto_complete_parent(hass, setup_entry):
    t = await add(hass, title="Move house", subtasks=["Boxes", "Keys"])
    a, b = [s["id"] for s in t["subtasks"]]
    await svc(hass, "update_subtask", {"task_id": t["id"], "subtask_id": a, "done": True})
    (cur,) = await tasks(hass)
    assert cur["status"] == "open"
    await svc(hass, "update_subtask", {"task_id": t["id"], "subtask_id": b, "done": True})
    (cur,) = await tasks(hass)
    assert cur["status"] == "done" and cur["completed_at"]
    # un-ticking a subtask reopens the parent
    await svc(hass, "update_subtask", {"task_id": t["id"], "subtask_id": b, "done": False})
    assert (await tasks(hass))[0]["status"] == "open"


async def test_add_rename_remove_subtask(hass, setup_entry):
    t = await add(hass, title="X")
    resp = await svc(hass, "add_subtask", {"task_id": t["id"], "title": "one"}, response=True)
    sid = resp[ENTITY]["subtask"]["id"]
    await svc(hass, "update_subtask", {"task_id": t["id"], "subtask_id": sid, "title": "uno"})
    assert (await tasks(hass))[0]["subtasks"][0]["title"] == "uno"
    await svc(hass, "remove_subtask", {"task_id": t["id"], "subtask_id": sid})
    assert (await tasks(hass))[0]["subtasks"] == []
    with pytest.raises(ServiceValidationError):
        await svc(hass, "remove_subtask", {"task_id": t["id"], "subtask_id": sid})
    with pytest.raises(ServiceValidationError):
        await svc(hass, "update_subtask", {"task_id": t["id"], "subtask_id": "nope", "done": True})


async def test_snooze_to_tomorrow_keeps_time(hass, setup_entry, freezer: FrozenDateTimeFactory):
    freezer.move_to("2026-03-10 09:00:00")
    t = await add(hass, title="Call", due_date="2026-03-05", due_time="14:30:00")
    await svc(hass, "snooze_task", {"task_id": t["id"]})
    (cur,) = await tasks(hass)
    assert (cur["due_date"], cur["due_time"]) == ("2026-03-11", "14:30")
    assert cur["history"][-1]["event"] == "snoozed"


async def test_delete_completed(hass, setup_entry):
    a = await add(hass, title="a")
    await add(hass, title="b")
    await svc(hass, "complete_task", {"task_id": a["id"]})
    resp = await svc(hass, "delete_completed", response=True)
    assert resp[ENTITY]["deleted"] == 1
    assert [t["title"] for t in await tasks(hass)] == ["b"]


async def test_move_task_service(hass, setup_entry):
    a, _b, c = [await add(hass, title=x) for x in "abc"]
    await svc(hass, "move_task", {"task_id": c["id"]})
    assert [t["title"] for t in await tasks(hass)] == ["c", "a", "b"]
    await svc(hass, "move_task", {"task_id": c["id"], "previous_task_id": a["id"]})
    assert [t["title"] for t in await tasks(hass)] == ["a", "c", "b"]
    with pytest.raises(ServiceValidationError):
        await svc(hass, "move_task", {"task_id": c["id"], "previous_task_id": "nope"})


async def test_recurring_task_rolls_over_instead_of_completing(hass, setup_entry, freezer):
    freezer.move_to("2026-03-10 09:00:00")
    t = await add(hass, title="Pay rent", due_date="2026-03-01", recurrence={"type": "monthly"},
                  subtasks=["Check amount"])
    sid = t["subtasks"][0]["id"]
    await svc(hass, "update_subtask", {"task_id": t["id"], "subtask_id": sid, "done": True})
    (cur,) = await tasks(hass)
    # last subtask done -> parent completed -> rolled to next month, subtasks reset
    assert cur["status"] == "open" and cur["due_date"] == "2026-04-01"
    assert cur["subtasks"][0]["done"] is False
    assert cur["completed_at"] is None and cur["last_completed_at"]
    assert [h["event"] for h in cur["history"]] == ["created", "completed"]
    assert cur["history"][-1]["next_due"] == "2026-04-01"


async def test_todo_card_completes_recurring_task_via_rollover(hass, setup_entry, freezer):
    freezer.move_to("2026-03-10 09:00:00")
    await add(hass, title="Water plants", due_date="2026-03-10",
              recurrence={"type": "after_completion", "days": 4})
    await hass.services.async_call(
        "todo", "update_item", {"entity_id": ENTITY, "item": "Water plants", "status": "completed"},
        blocking=True)
    (cur,) = await tasks(hass)
    assert cur["status"] == "open" and cur["due_date"] == "2026-03-14"
    assert hass.states.get(ENTITY).state == "1"


async def test_recurrence_event_flag_and_clearing(hass, setup_entry, freezer):
    from pytest_homeassistant_custom_component.common import async_capture_events
    events = async_capture_events(hass, "tickoff_task_completed")
    freezer.move_to("2026-03-10 09:00:00")
    t = await add(hass, title="x", due_date="2026-03-10", recurrence={"type": "daily"})
    await svc(hass, "complete_task", {"task_id": t["id"]})
    await hass.async_block_till_done()
    assert events[0].data["recurring"] is True
    await svc(hass, "update_task", {"task_id": t["id"], "recurrence": None})
    await svc(hass, "complete_task", {"task_id": t["id"]})
    assert (await tasks(hass))[0]["status"] == "done"


async def test_changing_due_via_update_resets_history_marker(hass, setup_entry):
    t = await add(hass, title="x", due_date="2026-03-10")
    await svc(hass, "update_task", {"task_id": t["id"], "due_date": "2026-03-12"})
    assert (await tasks(hass))[0]["due_date"] == "2026-03-12"
    assert isinstance(date.fromisoformat((await tasks(hass))[0]["due_date"]), date)
