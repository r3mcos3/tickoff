"""Tickoff: tasks for Home Assistant."""

from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.typing import ConfigType

from .const import DOMAIN
from .services import async_register_services
from .storage import TaskStore
from .tags import async_get_tag_registry

PLATFORMS: list[Platform] = [Platform.TODO]

type TickoffConfigEntry = ConfigEntry[TaskStore]

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Register the integration-wide services."""
    async_register_services(hass)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: TickoffConfigEntry) -> bool:
    """Set up a task list from a config entry."""
    tags = await async_get_tag_registry(hass)
    store = TaskStore(hass, entry.entry_id, entry.title, tags)
    await store.async_load()
    entry.runtime_data = store
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: TickoffConfigEntry) -> bool:
    """Unload a config entry."""
    unloaded = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unloaded:
        entry.runtime_data.async_unsubscribe()
        await entry.runtime_data.async_flush()
        await (await async_get_tag_registry(hass)).async_flush()
    return unloaded


async def async_remove_entry(hass: HomeAssistant, entry: TickoffConfigEntry) -> None:
    """Delete the stored tasks when the list is removed."""
    tags = await async_get_tag_registry(hass)
    await TaskStore(hass, entry.entry_id, entry.title, tags).async_remove()
