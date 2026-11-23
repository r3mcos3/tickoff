"""Persistent task storage (Home Assistant Store) for one list."""

from __future__ import annotations

import uuid
from collections.abc import Callable
from datetime import date, time
from typing import Any

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .const import (
    SAVE_DELAY,
    STATUS_DONE,
    STATUS_OPEN,
    STORAGE_KEY_PREFIX,
    STORAGE_VERSION,
    TASK_COMPLETED_AT,
    TASK_CREATED_AT,
    TASK_DUE_DATE,
    TASK_DUE_TIME,
    TASK_ID,
    TASK_NOTES,
    TASK_POSITION,
    TASK_STATUS,
    TASK_TITLE,
    TASK_UPDATED_AT,
)

_UNSET: Any = object()


class TaskStore:
    """All tasks of one list, kept in memory and persisted with a delayed save."""

    def __init__(self, hass: HomeAssistant, entry_id: str) -> None:
        self._hass = hass
        self._store: Store[dict[str, Any]] = Store(
            hass, STORAGE_VERSION, f"{STORAGE_KEY_PREFIX}{entry_id}"
        )
        self._tasks: dict[str, dict[str, Any]] = {}
        self._listeners: list[Callable[[], None]] = []

    async def async_load(self) -> None:
        data = await self._store.async_load()
        self._tasks = {t[TASK_ID]: t for t in (data or {}).get("tasks", [])}

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

    @callback
    def tasks(self) -> list[dict[str, Any]]:
        """Return tasks in manual order."""
        return sorted(self._tasks.values(), key=lambda t: t[TASK_POSITION])

    @callback
    def get(self, task_id: str) -> dict[str, Any] | None:
        return self._tasks.get(task_id)

    @callback
    def add(
        self,
        title: str,
        *,
        notes: str | None = None,
        due_date: date | None = None,
        due_time: time | None = None,
    ) -> dict[str, Any]:
        now = dt_util.utcnow().isoformat()
        position = max((t[TASK_POSITION] for t in self._tasks.values()), default=-1) + 1
        task = {
            TASK_ID: uuid.uuid4().hex,
            TASK_TITLE: title,
            TASK_NOTES: notes or "",
            TASK_DUE_DATE: due_date.isoformat() if due_date else None,
            TASK_DUE_TIME: due_time.isoformat(timespec="minutes") if due_time else None,
            TASK_STATUS: STATUS_OPEN,
            TASK_COMPLETED_AT: None,
            TASK_POSITION: position,
            TASK_CREATED_AT: now,
            TASK_UPDATED_AT: now,
        }
        self._tasks[task[TASK_ID]] = task
        self._changed()
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
        done: bool | None = None,
    ) -> dict[str, Any]:
        """Update fields; pass None for notes/due_* to clear them, omit to keep."""
        task = self._tasks[task_id]
        if title is not None:
            task[TASK_TITLE] = title
        if notes is not _UNSET:
            task[TASK_NOTES] = notes or ""
        if due_date is not _UNSET:
            task[TASK_DUE_DATE] = due_date.isoformat() if due_date else None
        if due_time is not _UNSET:
            task[TASK_DUE_TIME] = (
                due_time.isoformat(timespec="minutes") if due_time else None
            )
        if task[TASK_DUE_DATE] is None:
            task[TASK_DUE_TIME] = None  # a time without a date is meaningless
        if done is not None:
            if done and task[TASK_STATUS] != STATUS_DONE:
                task[TASK_STATUS] = STATUS_DONE
                task[TASK_COMPLETED_AT] = dt_util.utcnow().isoformat()
            elif not done and task[TASK_STATUS] != STATUS_OPEN:
                task[TASK_STATUS] = STATUS_OPEN
                task[TASK_COMPLETED_AT] = None
        task[TASK_UPDATED_AT] = dt_util.utcnow().isoformat()
        self._changed()
        return task

    @callback
    def delete(self, task_ids: list[str]) -> None:
        for task_id in task_ids:
            self._tasks.pop(task_id)
        self._changed()

    @callback
    def move(self, task_id: str, previous_id: str | None) -> None:
        """Place task_id directly after previous_id (None = first)."""
        order = [t[TASK_ID] for t in self.tasks() if t[TASK_ID] != task_id]
        index = 0 if previous_id is None else order.index(previous_id) + 1
        order.insert(index, task_id)
        for position, tid in enumerate(order):
            self._tasks[tid][TASK_POSITION] = position
        self._changed()
