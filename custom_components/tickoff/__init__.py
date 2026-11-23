"""Tickoff: tasks for Home Assistant."""

from __future__ import annotations

from homeassistant.config_entries import SOURCE_SYSTEM, ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.typing import ConfigType

from .const import CONF_KIND, DOMAIN, KIND_OVERVIEW
from .frontend import async_setup_frontend
from .hub import async_get_hub
from .services import async_register_services
from .storage import TaskStore
from .tags import async_get_tag_registry
from .websocket_api import async_register_websocket

LIST_PLATFORMS: list[Platform] = [Platform.TODO, Platform.SENSOR]
OVERVIEW_PLATFORMS: list[Platform] = [Platform.SENSOR]

type TickoffConfigEntry = ConfigEntry[TaskStore | None]

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)


def is_overview(entry: ConfigEntry) -> bool:
    return entry.data.get(CONF_KIND) == KIND_OVERVIEW


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Register services, websocket commands and the dashboard card."""
    async_register_services(hass)
    async_register_websocket(hass)
    await async_setup_frontend(hass)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: TickoffConfigEntry) -> bool:
    """Set up a task list (or the overview) from a config entry."""
    hub = async_get_hub(hass)
    if is_overview(entry):
        entry.runtime_data = None
        await hass.config_entries.async_forward_entry_setups(entry, OVERVIEW_PLATFORMS)
        return True

    tags = await async_get_tag_registry(hass)
    store = TaskStore(hass, entry.entry_id, entry.title, tags)
    await store.async_load()
    entry.runtime_data = store
    hub.add_store(store)
    await hass.config_entries.async_forward_entry_setups(entry, LIST_PLATFORMS)

    # The first list also creates the overview entry (totals over all lists, global defaults)
    if not any(is_overview(e) for e in hass.config_entries.async_entries(DOMAIN)):
        hass.async_create_task(
            hass.config_entries.flow.async_init(DOMAIN, context={"source": SOURCE_SYSTEM})
        )
    return True


async def async_unload_entry(hass: HomeAssistant, entry: TickoffConfigEntry) -> bool:
    """Unload a config entry."""
    if is_overview(entry):
        return await hass.config_entries.async_unload_platforms(entry, OVERVIEW_PLATFORMS)
    unloaded = await hass.config_entries.async_unload_platforms(entry, LIST_PLATFORMS)
    if unloaded:
        store = entry.runtime_data
        async_get_hub(hass).remove_store(entry.entry_id)
        store.async_unsubscribe()
        await store.async_flush()
        await (await async_get_tag_registry(hass)).async_flush()
    return unloaded


async def async_remove_entry(hass: HomeAssistant, entry: TickoffConfigEntry) -> None:
    """Delete the stored tasks when the list is removed."""
    if is_overview(entry):
        return
    tags = await async_get_tag_registry(hass)
    await TaskStore(hass, entry.entry_id, entry.title, tags).async_remove()
