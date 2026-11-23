"""Sensors: open / due today / overdue."""

from __future__ import annotations

from typing import Any

from homeassistant.components.sensor import SensorEntity, SensorStateClass
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.helpers.event import async_track_time_change
from homeassistant.util import dt as dt_util

from . import TickoffConfigEntry
from .classify import OVERDUE, TODAY
from .const import DOMAIN
from .hub import Hub, async_get_hub

KINDS = ("open", "today", "overdue")
LABELS = {"open": "open tasks", "today": "tasks due today", "overdue": "overdue tasks"}
ICONS = {
    "open": "mdi:checkbox-blank-circle-outline",
    "today": "mdi:calendar-today",
    "overdue": "mdi:alert-circle-outline",
}


async def async_setup_entry(
    hass: HomeAssistant,
    entry: TickoffConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    hub = async_get_hub(hass)
    async_add_entities(TickoffCountSensor(hub, entry, kind) for kind in KINDS)


class TickoffCountSensor(SensorEntity):
    """Count of tasks: ``sensor.tickoff_open`` / ``_today`` / ``_overdue``."""

    _attr_should_poll = False
    _attr_has_entity_name = False
    _attr_state_class = SensorStateClass.MEASUREMENT
    _attr_native_unit_of_measurement = "tasks"

    def __init__(self, hub: Hub, entry: TickoffConfigEntry, kind: str) -> None:
        self._hub = hub
        self._kind = kind
        self._attr_name = f"Tickoff {LABELS[kind]}"
        self._attr_unique_id = f"{entry.entry_id}_{kind}"
        self._attr_icon = ICONS[kind]
        self.internal_integration_suggested_object_id = f"tickoff_{kind}"
        self._attr_device_info = DeviceInfo(identifiers={(DOMAIN, entry.entry_id)}, name="Tickoff")

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(self._hub.async_add_listener(self._refresh))
        # "today" / "overdue" change with the clock, not only with edits
        self.async_on_remove(async_track_time_change(self.hass, self._on_minute, second=0))
        self._refresh()

    @callback
    def _on_minute(self, _now: Any) -> None:
        self._refresh()

    @callback
    def _refresh(self) -> None:
        if self.hass is None or not self.entity_id:
            return
        now = dt_util.now()
        self._attr_native_value = self._hub.counts(now)[self._kind]
        attrs: dict[str, Any] = {}
        if self._kind in ("today", "overdue"):
            wanted = {TODAY} if self._kind == "today" else {OVERDUE}
            attrs["tasks"] = self._hub.brief_tasks(now, wanted)
        self._attr_extra_state_attributes = attrs
        self.async_write_ha_state()
