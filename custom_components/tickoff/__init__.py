"""Tickoff: tasks for Home Assistant."""

from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.typing import ConfigType

from .const import DOMAIN
from .frontend import async_setup_frontend
from .hub import async_get_hub
from .migrate import async_migrate_legacy
from .services import async_register_services
from .storage import TaskStore
from .tags import async_get_tag_registry
from .websocket_api import async_register_websocket

PLATFORMS: list[Platform] = [Platform.TODO, Platform.SENSOR]

type TickoffConfigEntry = ConfigEntry[TaskStore]

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Migrate old multi-list data, register services, websocket commands and the UI."""
    await async_migrate_legacy(hass)
    async_register_services(hass)
    async_register_websocket(hass)
    await async_setup_frontend(hass)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: TickoffConfigEntry) -> bool:
    """Set up Tickoff (there is exactly one entry)."""
    tags = await async_get_tag_registry(hass)
    store = TaskStore(hass, entry.entry_id, tags)
    await store.async_load()
    entry.runtime_data = store
    async_get_hub(hass).add_store(store)
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: TickoffConfigEntry) -> bool:
    """Unload Tickoff."""
    unloaded = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unloaded:
        store = entry.runtime_data
        async_get_hub(hass).remove_store(entry.entry_id)
        store.async_unsubscribe()
        await store.async_flush()
        await (await async_get_tag_registry(hass)).async_flush()
    return unloaded


async def async_remove_entry(hass: HomeAssistant, entry: TickoffConfigEntry) -> None:
    """Delete the stored tasks when the integration is removed."""
    tags = await async_get_tag_registry(hass)
    await TaskStore(hass, entry.entry_id, tags).async_remove()
