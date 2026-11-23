"""Persistent task storage (Home Assistant Store) for one list."""

from __future__ import annotations

import uuid
from collections.abc import Callable
from datetime import date, time, timedelta
from typing import Any

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .const import (
    EVENT_TASK_COMPLETED,
    EVENT_TASK_CREATED,
    EVENT_TASK_REOPENED,
    EVENT_TASK_SNOOZED,
    HISTORY_LIMIT,
    PRIORITY_NONE,
    SAVE_DELAY,
    STATUS_DONE,
    STATUS_OPEN,
    STORAGE_KEY_PREFIX,
    STORAGE_VERSION,
    TASK_COMPLETED_AT,
    TASK_CREATED_AT,
    TASK_DUE_DATE,
    TASK_DUE_TIME,
    TASK_DUE_UPDATED_AT,
    TASK_HISTORY,
    TASK_ID,
    TASK_LAST_COMPLETED_AT,
    TASK_NOTES,
    TASK_NOTIFIED_FOR,
    TASK_POSITION,
    TASK_PRIORITY,
    TASK_RECURRENCE,
    TASK_STATUS,
    TASK_SUBTASKS,
    TASK_TAGS,
    TASK_TITLE,
    TASK_UPDATED_AT,
)
from .recurrence import next_due, normalize
from .tags import TagRegistry

_UNSET: Any = object()


def _fmt_time(value: time | None) -> str | None:
    return value.isoformat(timespec="minutes") if value else None


class TaskStore:
    """All tasks of one list, kept in memory and persisted with a delayed save."""

    def __init__(
        self, hass: HomeAssistant, entry_id: str, list_name: str, tags: TagRegistry
    ) -> None:
        self._hass = hass
        self.entry_id = entry_id
        self.list_name = list_name
        self._tag_registry = tags
        self._store: Store[dict[str, Any]] = Store(
            hass, STORAGE_VERSION, f"{STORAGE_KEY_PREFIX}{entry_id}"
        )
        self._tasks: dict[str, dict[str, Any]] = {}
        self._listeners: list[Callable[[], None]] = []
        self._unsub_tags: Callable[[], None] | None = None

    # ---- lifecycle -------------------------------------------------------

    async def async_load(self) -> None:
        data = await self._store.async_load()
        self._tasks = {t[TASK_ID]: t for t in (data or {}).get("tasks", [])}
        for task in self._tasks.values():  # tolerate data from older versions
            task.setdefault(TASK_PRIORITY, PRIORITY_NONE)
            task.setdefault(TASK_TAGS, [])
            task.setdefault(TASK_SUBTASKS, [])
            task.setdefault(TASK_RECURRENCE, None)
            task.setdefault(TASK_HISTORY, [])
            task.setdefault(TASK_LAST_COMPLETED_AT, None)
            task.setdefault(TASK_DUE_UPDATED_AT, task.get(TASK_CREATED_AT))
            task.setdefault(TASK_NOTIFIED_FOR, None)
            # drop tags that no longer exist in the global register
            task[TASK_TAGS] = [t for t in task[TASK_TAGS] if self._tag_registry.find(t)]
        self._unsub_tags = self._tag_registry.subscribe(
            self._on_tag_renamed, self._on_tag_deleted
        )

    @callback
    def async_unsubscribe(self) -> None:
        if self._unsub_tags is not None:
            self._unsub_tags()
            self._unsub_tags = None

    async def async_flush(self) -> None:
        """Write pending changes now (delayed saves are lost on unload otherwise)."""
        await self._store.async_save(self._data_to_save())

    async def async_remove(self) -> None:
        await self._store.async_remove()

    @callback
    def async_add_listener(self, listener: Callable[[], None]) -> Callable[[], None]:
        self._listeners.append(listener)

        @callback
        def _remove() -> None:
            self._listeners.remove(listener)

        return _remove

    @callback
    def _changed(self) -> None:
        self._store.async_delay_save(self._data_to_save, SAVE_DELAY)
        for listener in list(self._listeners):
            listener()

    @callback
    def _data_to_save(self) -> dict[str, Any]:
        return {"tasks": self.tasks()}

    # ---- helpers ---------------------------------------------------------

    @callback
    def _fire(self, event: str, task: dict[str, Any], **extra: Any) -> None:
        self._hass.bus.async_fire(
            event,
            {
                "entry_id": self.entry_id,
                "list_name": self.list_name,
                "task_id": task[TASK_ID],
                "title": task[TASK_TITLE],
                "due_date": task[TASK_DUE_DATE],
                "due_time": task[TASK_DUE_TIME],
                "priority": task[TASK_PRIORITY],
                "tags": list(task[TASK_TAGS]),
                **extra,
            },
        )

    @staticmethod
    def _log(task: dict[str, Any], event: str, **extra: Any) -> None:
        history = task[TASK_HISTORY]
        history.append({"at": dt_util.utcnow().isoformat(), "event": event, **extra})
        del history[:-HISTORY_LIMIT]

    @callback
    def _resolve_tags(self, tags: list[str]) -> list[str]:
        """Register unknown tags (global register) and dedupe, keeping order."""
        resolved: list[str] = []
        for tag in tags:
            if not tag.strip():
                continue
            name = self._tag_registry.ensure(tag)
            if name not in resolved:
                resolved.append(name)
        return resolved

    @callback
    def _on_tag_renamed(self, old: str, new: str) -> None:
        touched = False
        for task in self._tasks.values():
            if old in task[TASK_TAGS]:
                task[TASK_TAGS] = [new if t == old else t for t in task[TASK_TAGS]]
                touched = True
        if touched:
            self._changed()

    @callback
    def _on_tag_deleted(self, name: str) -> None:
        touched = False
        for task in self._tasks.values():
            if name in task[TASK_TAGS]:
                task[TASK_TAGS] = [t for t in task[TASK_TAGS] if t != name]
                touched = True
        if touched:
            self._changed()

    @staticmethod
    def _set_due(task: dict[str, Any], due_date: date | None, due_time: time | None) -> None:
        task[TASK_DUE_DATE] = due_date.isoformat() if due_date else None
        task[TASK_DUE_TIME] = _fmt_time(due_time) if due_date else None
        task[TASK_DUE_UPDATED_AT] = dt_util.now().isoformat()
        task[TASK_NOTIFIED_FOR] = None

    # ---- queries ---------------------------------------------------------

    @callback
    def tasks(self) -> list[dict[str, Any]]:
        """Return tasks in manual order."""
        return sorted(self._tasks.values(), key=lambda t: t[TASK_POSITION])

    @callback
    def get(self, task_id: str) -> dict[str, Any] | None:
        return self._tasks.get(task_id)

    # ---- mutations -------------------------------------------------------

    @callback
    def add(
        self,
        title: str,
        *,
        notes: str | None = None,
        due_date: date | None = None,
        due_time: time | None = None,
        priority: int = PRIORITY_NONE,
        tags: list[str] | None = None,
        recurrence: dict[str, Any] | None = None,
        subtasks: list[str] | None = None,
    ) -> dict[str, Any]:
        now = dt_util.utcnow().isoformat()
        position = max((t[TASK_POSITION] for t in self._tasks.values()), default=-1) + 1
        task: dict[str, Any] = {
            TASK_ID: uuid.uuid4().hex,
            TASK_TITLE: title,
            TASK_NOTES: notes or "",
            TASK_PRIORITY: priority,
            TASK_TAGS: self._resolve_tags(tags or []),
            TASK_SUBTASKS: [
                {"id": uuid.uuid4().hex, "title": s, "done": False} for s in (subtasks or [])
            ],
            TASK_RECURRENCE: normalize(recurrence, due_date, dt_util.now().date()),
            TASK_STATUS: STATUS_OPEN,
            TASK_COMPLETED_AT: None,
            TASK_LAST_COMPLETED_AT: None,
            TASK_POSITION: position,
            TASK_CREATED_AT: now,
            TASK_UPDATED_AT: now,
            TASK_HISTORY: [],
        }
        self._set_due(task, due_date, due_time)
        self._log(task, "created")
        self._tasks[task[TASK_ID]] = task
        self._changed()
        self._fire(EVENT_TASK_CREATED, task)
        return task

    @callback
    def update(
        self,
        task_id: str,
        *,
        title: str | None = None,
        notes: Any = _UNSET,
        due_date: Any = _UNSET,
        due_time: Any = _UNSET,
        priority: int | None = None,
        tags: list[str] | None = None,
        recurrence: Any = _UNSET,
        done: bool | None = None,
    ) -> dict[str, Any]:
        """Update fields; pass None for notes/due_*/recurrence to clear them, omit to keep."""
        task = self._tasks[task_id]
        if title is not None:
            task[TASK_TITLE] = title
        if notes is not _UNSET:
            task[TASK_NOTES] = notes or ""
        if due_date is not _UNSET or due_time is not _UNSET:
            new_date = (
                (date.fromisoformat(task[TASK_DUE_DATE]) if task[TASK_DUE_DATE] else None)
                if due_date is _UNSET
                else due_date
            )
            new_time = (
                (time.fromisoformat(task[TASK_DUE_TIME]) if task[TASK_DUE_TIME] else None)
                if due_time is _UNSET
                else due_time
            )
            if (new_date.isoformat() if new_date else None, _fmt_time(new_time)) != (
                task[TASK_DUE_DATE],
                task[TASK_DUE_TIME],
            ):
                self._set_due(task, new_date, new_time)
        if priority is not None:
            task[TASK_PRIORITY] = priority
        if tags is not None:
            task[TASK_TAGS] = self._resolve_tags(tags)
        if recurrence is not _UNSET:
            due = date.fromisoformat(task[TASK_DUE_DATE]) if task[TASK_DUE_DATE] else None
            task[TASK_RECURRENCE] = normalize(recurrence, due, dt_util.now().date())
        task[TASK_UPDATED_AT] = dt_util.utcnow().isoformat()
        if done is True:
            self._complete(task)
        elif done is False:
            self._reopen(task)
        self._changed()
        return task

    @callback
    def _complete(self, task: dict[str, Any]) -> None:
        """Tick off. Recurring tasks stay open and roll to the next due date."""
        if task[TASK_STATUS] == STATUS_DONE:
            return
        now = dt_util.utcnow().isoformat()
        task[TASK_LAST_COMPLETED_AT] = now
        rule = task[TASK_RECURRENCE]
        if rule:
            today = dt_util.now().date()
            due = date.fromisoformat(task[TASK_DUE_DATE]) if task[TASK_DUE_DATE] else None
            new_due = next_due(rule, due, today)
            self._log(task, "completed", next_due=new_due.isoformat())
            time_ = time.fromisoformat(task[TASK_DUE_TIME]) if task[TASK_DUE_TIME] else None
            for sub in task[TASK_SUBTASKS]:
                sub["done"] = False
            self._set_due(task, new_due, time_)
            self._fire(EVENT_TASK_COMPLETED, task, recurring=True)
            return
        task[TASK_STATUS] = STATUS_DONE
        task[TASK_COMPLETED_AT] = now
        self._log(task, "completed")
        self._fire(EVENT_TASK_COMPLETED, task, recurring=False)

    @callback
    def _reopen(self, task: dict[str, Any]) -> None:
        if task[TASK_STATUS] != STATUS_DONE:
            return
        task[TASK_STATUS] = STATUS_OPEN
        task[TASK_COMPLETED_AT] = None
        self._log(task, "reopened")
        self._fire(EVENT_TASK_REOPENED, task)

    @callback
    def snooze(self, task_id: str) -> dict[str, Any]:
        """Push the due date to tomorrow (time is kept)."""
        task = self._tasks[task_id]
        tomorrow = dt_util.now().date() + timedelta(days=1)
        time_ = time.fromisoformat(task[TASK_DUE_TIME]) if task[TASK_DUE_TIME] else None
        self._set_due(task, tomorrow, time_)
        task[TASK_UPDATED_AT] = dt_util.utcnow().isoformat()
        self._log(task, "snoozed", to=tomorrow.isoformat())
        self._changed()
        self._fire(EVENT_TASK_SNOOZED, task)
        return task

    @callback
    def delete(self, task_ids: list[str]) -> None:
        for task_id in task_ids:
            self._tasks.pop(task_id)
        self._changed()

    @callback
    def delete_completed(self) -> int:
        """Remove every done task; returns how many."""
        done = [t[TASK_ID] for t in self._tasks.values() if t[TASK_STATUS] == STATUS_DONE]
        if done:
            self.delete(done)
        return len(done)

    @callback
    def move(self, task_id: str, previous_id: str | None) -> None:
        """Place task_id directly after previous_id (None = first)."""
        order = [t[TASK_ID] for t in self.tasks() if t[TASK_ID] != task_id]
        index = 0 if previous_id is None else order.index(previous_id) + 1
        order.insert(index, task_id)
        for position, tid in enumerate(order):
            self._tasks[tid][TASK_POSITION] = position
        self._changed()

    # ---- subtasks --------------------------------------------------------

    @callback
    def add_subtask(self, task_id: str, title: str) -> dict[str, Any]:
        task = self._tasks[task_id]
        sub = {"id": uuid.uuid4().hex, "title": title, "done": False}
        task[TASK_SUBTASKS].append(sub)
        if task[TASK_STATUS] == STATUS_DONE:  # a new open subtask reopens a done parent
            self._reopen(task)
        self._changed()
        return sub

    @callback
    def update_subtask(
        self,
        task_id: str,
        subtask_id: str,
        *,
        title: str | None = None,
        done: bool | None = None,
    ) -> dict[str, Any]:
        """Edit a subtask. Ticking the last open subtask completes the parent."""
        task = self._tasks[task_id]
        sub = next(s for s in task[TASK_SUBTASKS] if s["id"] == subtask_id)
        if title is not None:
            sub["title"] = title
        if done is not None:
            sub["done"] = done
        if done is True and all(s["done"] for s in task[TASK_SUBTASKS]):
            self._complete(task)
        elif done is False and task[TASK_STATUS] == STATUS_DONE:
            self._reopen(task)
        self._changed()
        return sub

    @callback
    def remove_subtask(self, task_id: str, subtask_id: str) -> None:
        task = self._tasks[task_id]
        before = len(task[TASK_SUBTASKS])
        task[TASK_SUBTASKS] = [s for s in task[TASK_SUBTASKS] if s["id"] != subtask_id]
        if len(task[TASK_SUBTASKS]) == before:
            raise KeyError(subtask_id)
        self._changed()

    # ---- notifier support ------------------------------------------------

    @callback
    def mark_notified(self, task_id: str, due_date: str) -> None:
        self._tasks[task_id][TASK_NOTIFIED_FOR] = due_date
        self._store.async_delay_save(self._data_to_save, SAVE_DELAY)
