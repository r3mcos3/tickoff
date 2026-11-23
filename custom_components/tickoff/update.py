"""Update entity: check GitHub for new Tickoff releases and install them from Home Assistant."""

from __future__ import annotations

import logging
import re
from datetime import timedelta
from typing import Any

from homeassistant.components.update import UpdateEntity, UpdateEntityFeature
from homeassistant.const import EVENT_STATE_CHANGED
from homeassistant.core import Event, EventStateChangedData, HomeAssistant, State, callback
from homeassistant.helpers import entity_registry as er
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
# Package managers that may manage Tickoff: HACS and the Marketplace built into Home Assistant 2026.11+.
# Both create an update entity for it whose release_url points at this repository.
MANAGER_PLATFORMS = ("hacs", "marketplace")
MANAGER_RELEASE_PREFIX = f"https://github.com/{REPO}/"


def _plain(version: str | None) -> str | None:
    """HACS names versions after the tag (v0.4.2); ours are plain (0.4.2)."""
    if not version or version in ("unknown", "unavailable"):
        return None
    return version[1:] if re.match(r"^v\d", version) else version


def _newer(a: str, b: str) -> bool:
    """True when version a is newer than b (numeric dotted versions; anything else is not newer)."""
    try:
        return tuple(int(x) for x in a.split(".")) > tuple(int(x) for x in b.split("."))
    except ValueError:
        return False


@callback
def _is_update_event(event_data: EventStateChangedData) -> bool:
    return event_data["entity_id"].startswith("update.")


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
    installed = await hass.async_add_executor_job(installed_version)  # reads manifest.json: not in the event loop
    async_add_entities([TickoffUpdateEntity(coordinator, entry, installed)])


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

    def __init__(self, coordinator: DataUpdateCoordinator[dict[str, Any] | None], entry: TickoffConfigEntry, installed: str) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{entry.entry_id}_update"
        self.internal_integration_suggested_object_id = "tickoff"  # update.tickoff (HACS owns update.tickoff_update)
        self._attr_device_info = DeviceInfo(identifiers={(DOMAIN, entry.entry_id)}, name="Tickoff")
        self._installed = installed
        self._restart_pending = False

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()

        @callback
        def _hacs_changed(event: Event[EventStateChangedData]) -> None:
            if (new := event.data["new_state"]) and self._is_hacs_state(new):
                self.async_write_ha_state()

        self.async_on_remove(
            self.hass.bus.async_listen(EVENT_STATE_CHANGED, _hacs_changed, event_filter=_is_update_event)
        )

    # ---- HACS / Marketplace: when a package manager manages Tickoff it owns the install, so there is only ever one ----

    def _is_hacs_state(self, state: State) -> bool:
        if state.domain != "update" or state.entity_id == self.entity_id:
            return False
        if not str(state.attributes.get("release_url") or "").startswith(MANAGER_RELEASE_PREFIX):
            return False
        entry = er.async_get(self.hass).async_get(state.entity_id)
        return entry is not None and entry.platform in MANAGER_PLATFORMS

    def _hacs_state(self) -> State | None:
        return next((s for s in self.hass.states.async_all("update") if self._is_hacs_state(s)), None)

    @property
    def available(self) -> bool:
        return True  # the installed version is always known, even when GitHub is unreachable

    @property
    def installed_version(self) -> str:
        hacs = self._hacs_state()
        return (_plain(hacs.attributes.get("installed_version")) if hacs else None) or self._installed

    @property
    def latest_version(self) -> str:
        data = self.coordinator.data
        github = data["version"] if data else None
        hacs = self._hacs_state()
        theirs = _plain(hacs.attributes.get("latest_version")) if hacs else None
        candidates = [v for v in (github, theirs, self.installed_version) if v]
        best = candidates[0]
        for version in candidates[1:]:
            if _newer(version, best):
                best = version
        return best

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
        hacs = self._hacs_state()
        return {"restart_required": self._restart_pending, "managed_by": hacs.entity_id if hacs else None}

    async def async_install(self, version: str | None, backup: bool, **kwargs: Any) -> None:
        """Install the latest release; Home Assistant has to be restarted afterwards."""
        target = version or self.latest_version
        if target == self.installed_version:
            return
        hacs = self._hacs_state()
        if hacs is not None:
            # HACS or the Marketplace manages this install: let it do the work (it also raises its own restart
            # notice and keeps its own records), so the two update entities never disagree and nothing has to be
            # installed twice. The user context is passed on: the Marketplace checks who accepted its warning.
            await self.hass.services.async_call(
                "update",
                "install",
                {"entity_id": hacs.entity_id, "version": f"v{target}"},
                blocking=True,
                context=self._context,
            )
            self._restart_pending = True
            self.async_write_ha_state()
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
