"""tickoff: tasks for Home Assistant."""

from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant

from .storage import TaskStore

PLATFORMS: list[Platform] = [Platform.TODO]

type TasksConfigEntry = ConfigEntry[TaskStore]


async def async_setup_entry(hass: HomeAssistant, entry: TasksConfigEntry) -> bool:
    """Set up a task list from a config entry."""
    store = TaskStore(hass, entry.entry_id)
    await store.async_load()
    entry.runtime_data = store
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: TasksConfigEntry) -> bool:
    """Unload a config entry."""
    unloaded = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unloaded:
        await entry.runtime_data.async_flush()
    return unloaded


async def async_remove_entry(hass: HomeAssistant, entry: TasksConfigEntry) -> None:
    """Delete the stored tasks when the list is removed."""
    await TaskStore(hass, entry.entry_id).async_remove()
