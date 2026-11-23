"""Todo platform: every list is a standard todo entity."""

from __future__ import annotations

from datetime import date, datetime, time
from typing import Any

from homeassistant.components.todo import (
    TodoItem,
    TodoItemStatus,
    TodoListEntity,
    TodoListEntityFeature,
)
from homeassistant.core import HomeAssistant, ServiceResponse, callback
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.util import dt as dt_util

from . import TickoffConfigEntry
from .const import (
    DOMAIN,
    STATUS_DONE,
    TASK_DUE_DATE,
    TASK_DUE_TIME,
    TASK_ID,
    TASK_NOTES,
    TASK_STATUS,
    TASK_TITLE,
)
from .services import task_to_response
from .storage import TaskStore

_UNSET: Any = object()


async def async_setup_entry(
    hass: HomeAssistant,
    entry: TickoffConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    async_add_entities([TickoffTodoEntity(entry)])


def _to_todo_item(task: dict[str, Any]) -> TodoItem:
    due: date | datetime | None = None
    if task[TASK_DUE_DATE]:
        due_date = date.fromisoformat(task[TASK_DUE_DATE])
        if task[TASK_DUE_TIME]:
            due = datetime.combine(
                due_date,
                time.fromisoformat(task[TASK_DUE_TIME]),
                tzinfo=dt_util.get_default_time_zone(),
            )
        else:
            due = due_date
    return TodoItem(
        summary=task[TASK_TITLE],
        uid=task[TASK_ID],
        status=(
            TodoItemStatus.COMPLETED
            if task[TASK_STATUS] == STATUS_DONE
            else TodoItemStatus.NEEDS_ACTION
        ),
        due=due,
        description=task[TASK_NOTES] or None,
    )


def _split_due(due: date | datetime | None) -> tuple[date | None, time | None]:
    if isinstance(due, datetime):
        local = dt_util.as_local(due)
        return local.date(), local.time().replace(second=0, microsecond=0)
    return due, None


class TickoffTodoEntity(TodoListEntity):
    """All tasks."""

    # Not name-from-device: lets us decouple the friendly name (bare list name)
    # from the entity_id (tickoff_ prefix).
    _attr_has_entity_name = False
    _attr_should_poll = False
    _attr_supported_features = (
        TodoListEntityFeature.CREATE_TODO_ITEM
        | TodoListEntityFeature.UPDATE_TODO_ITEM
        | TodoListEntityFeature.DELETE_TODO_ITEM
        | TodoListEntityFeature.MOVE_TODO_ITEM
        | TodoListEntityFeature.SET_DUE_DATE_ON_ITEM
        | TodoListEntityFeature.SET_DUE_DATETIME_ON_ITEM
        | TodoListEntityFeature.SET_DESCRIPTION_ON_ITEM
    )

    def __init__(self, entry: TickoffConfigEntry) -> None:
        self._store: TaskStore = entry.runtime_data
        self._attr_unique_id = entry.entry_id
        self._attr_device_info = DeviceInfo(identifiers={(DOMAIN, entry.entry_id)}, name="Tickoff")
        self._attr_name = "Tickoff"
        self.internal_integration_suggested_object_id = "tickoff"  # -> todo.tickoff

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(self._store.async_add_listener(self._refresh))
        self._refresh()

    @callback
    def _refresh(self) -> None:
        self._attr_todo_items = [_to_todo_item(t) for t in self._store.tasks()]
        if self.hass is not None and self.entity_id:
            self.async_write_ha_state()

    async def async_create_todo_item(self, item: TodoItem) -> None:
        due_date, due_time = _split_due(item.due)
        self._store.add(
            item.summary or "", notes=item.description, due_date=due_date, due_time=due_time
        )

    async def async_update_todo_item(self, item: TodoItem) -> None:
        kwargs: dict[str, Any] = {
            "title": item.summary,
            "notes": item.description,
            "done": item.status == TodoItemStatus.COMPLETED,
        }
        due_date, due_time = _split_due(item.due)
        kwargs["due_date"] = due_date
        kwargs["due_time"] = due_time
        self._store.update(item.uid or "", **kwargs)

    async def async_delete_todo_items(self, uids: list[str]) -> None:
        self._store.delete(uids)

    async def async_move_todo_item(
        self, uid: str, previous_uid: str | None = None
    ) -> None:
        self._store.move(uid, previous_uid)

    # --- Tickoff services (priority, tags and friends live outside TodoItem) ---

    def _require(self, task_id: str) -> None:
        if self._store.get(task_id) is None:
            raise ServiceValidationError(f"Unknown task {task_id!r}")

    async def async_add_task(self, **data: Any) -> ServiceResponse:
        task = self._store.add(
            data["title"],
            notes=data.get("notes"),
            due_date=data.get("due_date"),
            due_time=data.get("due_time"),
            priority=data.get("priority", 0),
            tags=data.get("tags"),
            recurrence=data.get("recurrence"),
            subtasks=data.get("subtasks"),
        )
        return {"task": task_to_response(task)}

    async def async_update_task(self, **data: Any) -> None:
        task_id = data.pop("task_id")
        self._require(task_id)
        self._store.update(task_id, **data)

    async def async_complete_task(self, task_id: str) -> None:
        self._require(task_id)
        self._store.update(task_id, done=True)

    async def async_reopen_task(self, task_id: str) -> None:
        self._require(task_id)
        self._store.update(task_id, done=False)

    async def async_delete_task(self, task_id: str) -> None:
        self._require(task_id)
        self._store.delete([task_id])

    async def async_snooze_task(self, task_id: str) -> None:
        self._require(task_id)
        self._store.snooze(task_id)

    async def async_move_task(self, task_id: str, previous_task_id: str | None = None) -> None:
        self._require(task_id)
        if previous_task_id is not None:
            self._require(previous_task_id)
        self._store.move(task_id, previous_task_id)

    async def async_delete_completed(self) -> ServiceResponse:
        return {"deleted": self._store.delete_completed()}

    async def async_add_subtask(self, task_id: str, title: str) -> ServiceResponse:
        self._require(task_id)
        return {"subtask": dict(self._store.add_subtask(task_id, title))}

    async def async_update_subtask(self, task_id: str, subtask_id: str, **data: Any) -> None:
        self._require(task_id)
        try:
            self._store.update_subtask(task_id, subtask_id, **data)
        except StopIteration as err:
            raise ServiceValidationError(f"Unknown subtask {subtask_id!r}") from err

    async def async_remove_subtask(self, task_id: str, subtask_id: str) -> None:
        self._require(task_id)
        try:
            self._store.remove_subtask(task_id, subtask_id)
        except KeyError as err:
            raise ServiceValidationError(f"Unknown subtask {subtask_id!r}") from err

    async def async_get_tasks(
        self, status: str | None = None, tag: str | None = None
    ) -> ServiceResponse:
        tasks = self._store.tasks()
        if status:
            tasks = [t for t in tasks if t[TASK_STATUS] == status]
        if tag:
            wanted = tag.strip().lower()
            tasks = [t for t in tasks if wanted in (x.lower() for x in t["tags"])]
        return {"tasks": [task_to_response(t) for t in tasks]}
