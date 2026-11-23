"""Hub: all loaded lists, aggregated views and the due-date notifier."""

from __future__ import annotations

import logging
from collections.abc import Callable
from datetime import datetime, time, timedelta
from typing import Any

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.event import async_track_time_interval
from homeassistant.util import dt as dt_util
from homeassistant.util.hass_dict import HassKey

from .classify import OVERDUE, TODAY, classify, due_moment
from .const import (
    CONF_KIND,
    CONF_NOTIFY_SERVICE,
    CONF_NOTIFY_TIME,
    DEFAULT_NOTIFY_TIME,
    DOMAIN,
    EVENT_TASK_DUE,
    KIND_OVERVIEW,
    STATUS_OPEN,
    TASK_DUE_DATE,
    TASK_DUE_TIME,
    TASK_DUE_UPDATED_AT,
    TASK_ID,
    TASK_NOTIFIED_FOR,
    TASK_PRIORITY,
    TASK_STATUS,
    TASK_TAGS,
    TASK_TITLE,
)
from .storage import TaskStore

_LOGGER = logging.getLogger(__name__)

DATA_HUB: HassKey[Hub] = HassKey(f"{DOMAIN}_hub")
CHECK_INTERVAL = timedelta(minutes=1)


class Hub:
    """Registry of loaded task stores plus integration-wide behaviour."""

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self.stores: dict[str, TaskStore] = {}
        self._unsubs: dict[str, Callable[[], None]] = {}
        self._listeners: list[Callable[[], None]] = []
        self._unsub_timer: Callable[[], None] | None = None

    # ---- membership ------------------------------------------------------

    @callback
    def add_store(self, store: TaskStore) -> None:
        self.stores[store.entry_id] = store
        self._unsubs[store.entry_id] = store.async_add_listener(self._notify_listeners)
        if self._unsub_timer is None:
            self._unsub_timer = async_track_time_interval(
                self.hass, self._async_tick, CHECK_INTERVAL
            )
        self._notify_listeners()

    @callback
    def remove_store(self, entry_id: str) -> None:
        self.stores.pop(entry_id, None)
        if unsub := self._unsubs.pop(entry_id, None):
            unsub()
        if not self.stores and self._unsub_timer is not None:
            self._unsub_timer()
            self._unsub_timer = None
        self._notify_listeners()

    @callback
    def async_add_listener(self, listener: Callable[[], None]) -> Callable[[], None]:
        self._listeners.append(listener)

        @callback
        def _remove() -> None:
            self._listeners.remove(listener)

        return _remove

    @callback
    def _notify_listeners(self) -> None:
        for listener in list(self._listeners):
            listener()

    # ---- settings --------------------------------------------------------

    @callback
    def _overview_options(self) -> dict[str, Any]:
        for entry in self.hass.config_entries.async_entries(DOMAIN):
            if entry.data.get(CONF_KIND) == KIND_OVERVIEW:
                return dict(entry.options)
        return {}

    @callback
    def notify_time(self) -> time:
        raw = self._overview_options().get(CONF_NOTIFY_TIME) or DEFAULT_NOTIFY_TIME
        try:
            return time.fromisoformat(raw)
        except ValueError:
            return time.fromisoformat(DEFAULT_NOTIFY_TIME)

    @callback
    def notify_service(self, entry_id: str) -> str | None:
        """Per-list service wins over the global default."""
        entry = self.hass.config_entries.async_get_entry(entry_id)
        if entry and (service := entry.options.get(CONF_NOTIFY_SERVICE)):
            return service
        return self._overview_options().get(CONF_NOTIFY_SERVICE) or None

    # ---- aggregated views --------------------------------------------------

    @callback
    def entity_id_for(self, entry_id: str) -> str | None:
        return er.async_get(self.hass).async_get_entity_id("todo", DOMAIN, entry_id)

    @callback
    def counts(self, now: datetime, entry_id: str | None = None) -> dict[str, int]:
        stores = [self.stores[entry_id]] if entry_id else list(self.stores.values())
        result = {"open": 0, "today": 0, "overdue": 0}
        for store in stores:
            for task in store.tasks():
                state = classify(task, now)
                if state is None:
                    continue
                result["open"] += 1
                if state == TODAY:
                    result["today"] += 1
                elif state == OVERDUE:
                    result["overdue"] += 1
        return result

    @callback
    def brief_tasks(
        self, now: datetime, wanted: set[str], entry_id: str | None = None, limit: int = 25
    ) -> list[dict[str, Any]]:
        """Short task descriptions (for sensor attributes), most urgent first."""
        stores = [self.stores[entry_id]] if entry_id else list(self.stores.values())
        out: list[dict[str, Any]] = []
        for store in stores:
            for task in store.tasks():
                if classify(task, now) in wanted:
                    out.append(
                        {
                            "title": task[TASK_TITLE],
                            "list": store.list_name,
                            "due_date": task[TASK_DUE_DATE],
                            "due_time": task[TASK_DUE_TIME],
                            "priority": task[TASK_PRIORITY],
                            "tags": list(task[TASK_TAGS]),
                        }
                    )
        out.sort(key=lambda t: (t["due_date"] or "", t["due_time"] or "", -t["priority"]))
        return out[:limit]

    # ---- notifier ----------------------------------------------------------

    async def _async_tick(self, now: datetime) -> None:
        await self.async_check_due(now)
        self._notify_listeners()  # today/overdue move with the clock

    async def async_check_due(self, now: datetime | None = None) -> int:
        """Notify once per task per due date. Returns the number of notifications.

        - A task without a time is due at the global notify time (default 08:00).
        - The "already notified" marker lives in the task itself (persisted), so a restart
          cannot cause a second message.
        - A due date that was set/changed after the trigger moment (task added or snoozed
          for today late in the day) is marked as handled without a message.
        """
        now = dt_util.as_local(now or dt_util.now())
        default_time = self.notify_time()
        sent = 0
        for store in list(self.stores.values()):
            for task in store.tasks():
                if task[TASK_STATUS] != STATUS_OPEN or not task[TASK_DUE_DATE]:
                    continue
                if task[TASK_NOTIFIED_FOR] == task[TASK_DUE_DATE]:
                    continue
                if task[TASK_DUE_DATE] != now.date().isoformat():
                    continue
                trigger = due_moment(task, default_time)
                if trigger is None or now < trigger:
                    continue
                updated = task.get(TASK_DUE_UPDATED_AT)
                late = bool(updated) and dt_util.parse_datetime(updated) is not None and (
                    dt_util.as_local(dt_util.parse_datetime(updated)) > trigger  # type: ignore[arg-type]
                )
                store.mark_notified(task[TASK_ID], task[TASK_DUE_DATE])
                if late:
                    continue
                await self._async_send(store, task)
                sent += 1
        return sent

    async def _async_send(self, store: TaskStore, task: dict[str, Any]) -> None:
        self.hass.bus.async_fire(
            EVENT_TASK_DUE,
            {
                "entry_id": store.entry_id,
                "list_name": store.list_name,
                "task_id": task[TASK_ID],
                "title": task[TASK_TITLE],
                "due_date": task[TASK_DUE_DATE],
                "due_time": task[TASK_DUE_TIME],
                "priority": task[TASK_PRIORITY],
                "tags": list(task[TASK_TAGS]),
            },
        )
        service = self.notify_service(store.entry_id)
        if not service:
            return
        message = task[TASK_TITLE] + (f" ({task[TASK_DUE_TIME]})" if task[TASK_DUE_TIME] else "")
        if not self.hass.services.has_service("notify", service):
            _LOGGER.warning("Notify service notify.%s not found; message skipped", service)
            return
        try:
            await self.hass.services.async_call(
                "notify",
                service,
                {"title": f"Tickoff · {store.list_name}", "message": message},
                blocking=False,
            )
        except Exception:
            _LOGGER.exception("Sending notification through notify.%s failed", service)


@callback
def async_get_hub(hass: HomeAssistant) -> Hub:
    return hass.data.setdefault(DATA_HUB, Hub(hass))
