"""Update entity: check GitHub for new Tickoff releases and install them from Home Assistant."""

from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any

from homeassistant.components.update import UpdateEntity, UpdateEntityFeature
from homeassistant.core import HomeAssistant
from homeassistant.helpers import issue_registry as ir
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.helpers.update_coordinator import (
    CoordinatorEntity,
    DataUpdateCoordinator,
    UpdateFailed,
)

from . import TickoffConfigEntry
from .const import DOMAIN
from .updater import REPO, UpdateError, async_fetch_latest, async_install, installed_version

_LOGGER = logging.getLogger(__name__)

CHECK_INTERVAL = timedelta(hours=6)
ISSUE_RESTART = "restart_required"


async def async_setup_entry(
    hass: HomeAssistant,
    entry: TickoffConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    coordinator: DataUpdateCoordinator[dict[str, Any] | None] = DataUpdateCoordinator(
        hass,
        _LOGGER,
        config_entry=entry,
        name="Tickoff releases",
        update_method=_fetch(hass),
        update_interval=CHECK_INTERVAL,
    )
    await coordinator.async_refresh()  # never blocks or fails the setup: GitHub may be unreachable
    async_add_entities([TickoffUpdateEntity(coordinator, entry)])


def _fetch(hass: HomeAssistant):
    async def _update() -> dict[str, Any] | None:
        try:
            return await async_fetch_latest(hass)
        except UpdateError as err:
            raise UpdateFailed(str(err)) from err
        except Exception as err:
            raise UpdateFailed(f"Could not reach GitHub: {err}") from err

    return _update


class TickoffUpdateEntity(CoordinatorEntity[DataUpdateCoordinator[dict[str, Any] | None]], UpdateEntity):
    """``update.tickoff``."""

    _attr_has_entity_name = False
    _attr_name = "Tickoff Update"
    _attr_title = "Tickoff"
    _attr_supported_features = UpdateEntityFeature.INSTALL | UpdateEntityFeature.RELEASE_NOTES

    def __init__(self, coordinator: DataUpdateCoordinator[dict[str, Any] | None], entry: TickoffConfigEntry) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{entry.entry_id}_update"
        self.internal_integration_suggested_object_id = "tickoff_update"
        self._attr_device_info = DeviceInfo(identifiers={(DOMAIN, entry.entry_id)}, name="Tickoff")
        self._installed = installed_version()
        self._restart_pending = False

    @property
    def available(self) -> bool:
        return True  # the installed version is always known, even when GitHub is unreachable

    @property
    def installed_version(self) -> str:
        return self._installed

    @property
    def latest_version(self) -> str:
        data = self.coordinator.data
        return data["version"] if data else self._installed

    @property
    def release_url(self) -> str:
        data = self.coordinator.data
        return data["url"] if data else f"https://github.com/{REPO}/releases"

    @property
    def release_summary(self) -> str | None:
        data = self.coordinator.data
        notes = (data or {}).get("notes") or ""
        return notes[:255] or None

    async def async_release_notes(self) -> str | None:
        data = self.coordinator.data
        return (data or {}).get("notes") or None

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        return {"restart_required": self._restart_pending}

    async def async_install(self, version: str | None, backup: bool, **kwargs: Any) -> None:
        """Install the latest release; Home Assistant has to be restarted afterwards."""
        target = version or self.latest_version
        if target == self._installed:
            return
        await async_install(self.hass, target)
        self._installed = target
        self._restart_pending = True
        ir.async_create_issue(
            self.hass,
            DOMAIN,
            ISSUE_RESTART,
            is_fixable=True,
            severity=ir.IssueSeverity.WARNING,
            translation_key=ISSUE_RESTART,
            translation_placeholders={"version": target},
        )
        self.async_write_ha_state()
