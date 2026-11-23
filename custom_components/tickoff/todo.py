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
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.util import dt as dt_util

from . import TasksConfigEntry
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
from .storage import TaskStore

_UNSET: Any = object()


async def async_setup_entry(
    hass: HomeAssistant,
    entry: TasksConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    async_add_entities([TasksTodoListEntity(entry)])


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


class TasksTodoListEntity(TodoListEntity):
    """One task list."""

    _attr_has_entity_name = True
    _attr_name = None
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

    def __init__(self, entry: TasksConfigEntry) -> None:
        self._store: TaskStore = entry.runtime_data
        self._attr_unique_id = entry.entry_id
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry.entry_id)}, name=f"Tickoff {entry.title}"
        )

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
