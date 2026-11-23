"""Services: task actions (on todo entities) and tag management (global)."""

from __future__ import annotations

from typing import Any

import voluptuous as vol
from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import (
    HomeAssistant,
    ServiceCall,
    ServiceResponse,
    SupportsResponse,
    callback,
)
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers import service
from homeassistant.helpers.storage import Store

from .const import (
    CONF_KIND,
    DOMAIN,
    KIND_OVERVIEW,
    PRIORITY_HIGH,
    PRIORITY_NONE,
    STORAGE_KEY_PREFIX,
    STORAGE_VERSION,
)
from .recurrence import RECURRENCE_SCHEMA
from .tags import async_get_tag_registry

COLOR = vol.All(cv.string, vol.Match(r"^#[0-9a-fA-F]{6}$"))
PRIORITY = vol.All(vol.Coerce(int), vol.Range(min=PRIORITY_NONE, max=PRIORITY_HIGH))
TAGS = vol.All(cv.ensure_list, [cv.string])
RECURRENCE = vol.Any(RECURRENCE_SCHEMA, None)

ADD_TASK_SCHEMA = {
    vol.Required("title"): cv.string,
    vol.Optional("notes"): vol.Any(cv.string, None),
    vol.Optional("due_date"): cv.date,
    vol.Optional("due_time"): cv.time,
    vol.Optional("priority"): PRIORITY,
    vol.Optional("tags"): TAGS,
    vol.Optional("recurrence"): RECURRENCE,
    vol.Optional("subtasks"): vol.All(cv.ensure_list, [cv.string]),
}
UPDATE_TASK_SCHEMA = {
    vol.Required("task_id"): cv.string,
    vol.Optional("title"): cv.string,
    vol.Optional("notes"): vol.Any(cv.string, None),
    vol.Optional("due_date"): vol.Any(cv.date, None),
    vol.Optional("due_time"): vol.Any(cv.time, None),
    vol.Optional("priority"): PRIORITY,
    vol.Optional("tags"): TAGS,
    vol.Optional("recurrence"): RECURRENCE,
}
TASK_ID_SCHEMA = {vol.Required("task_id"): cv.string}
GET_TASKS_SCHEMA = {
    vol.Optional("status"): vol.In(["open", "done"]),
    vol.Optional("tag"): cv.string,
}
MOVE_TASK_SCHEMA = {
    vol.Required("task_id"): cv.string,
    vol.Optional("previous_task_id"): vol.Any(cv.string, None),
}
ADD_SUBTASK_SCHEMA = {vol.Required("task_id"): cv.string, vol.Required("title"): cv.string}
UPDATE_SUBTASK_SCHEMA = {
    vol.Required("task_id"): cv.string,
    vol.Required("subtask_id"): cv.string,
    vol.Optional("title"): cv.string,
    vol.Optional("done"): cv.boolean,
}
REMOVE_SUBTASK_SCHEMA = {
    vol.Required("task_id"): cv.string,
    vol.Required("subtask_id"): cv.string,
}

ENTITY_SERVICES: tuple[tuple[str, dict, str, SupportsResponse], ...] = (
    ("add_task", ADD_TASK_SCHEMA, "async_add_task", SupportsResponse.OPTIONAL),
    ("update_task", UPDATE_TASK_SCHEMA, "async_update_task", SupportsResponse.NONE),
    ("complete_task", TASK_ID_SCHEMA, "async_complete_task", SupportsResponse.NONE),
    ("reopen_task", TASK_ID_SCHEMA, "async_reopen_task", SupportsResponse.NONE),
    ("delete_task", TASK_ID_SCHEMA, "async_delete_task", SupportsResponse.NONE),
    ("snooze_task", TASK_ID_SCHEMA, "async_snooze_task", SupportsResponse.NONE),
    ("move_task", MOVE_TASK_SCHEMA, "async_move_task", SupportsResponse.NONE),
    ("delete_completed", {}, "async_delete_completed", SupportsResponse.OPTIONAL),
    ("add_subtask", ADD_SUBTASK_SCHEMA, "async_add_subtask", SupportsResponse.OPTIONAL),
    ("update_subtask", UPDATE_SUBTASK_SCHEMA, "async_update_subtask", SupportsResponse.NONE),
    ("remove_subtask", REMOVE_SUBTASK_SCHEMA, "async_remove_subtask", SupportsResponse.NONE),
    ("get_tasks", GET_TASKS_SCHEMA, "async_get_tasks", SupportsResponse.ONLY),
)


async def _async_patch_unloaded_lists(hass: HomeAssistant, patch: Any) -> None:
    """Apply a tag change to lists that are not loaded (disabled/failed entries).

    Loaded lists are updated through the registry subscription; the others only exist as a
    Store file, so patch that directly. Otherwise a rename would silently drop the tag there.
    """
    for entry in hass.config_entries.async_entries(DOMAIN):
        if entry.data.get(CONF_KIND) == KIND_OVERVIEW or entry.state is ConfigEntryState.LOADED:
            continue
        store: Store[dict[str, Any]] = Store(
            hass, STORAGE_VERSION, f"{STORAGE_KEY_PREFIX}{entry.entry_id}"
        )
        data = await store.async_load()
        if not data:
            continue
        changed = False
        for task in data.get("tasks", []):
            new_tags = patch(task.get("tags", []))
            if new_tags != task.get("tags", []):
                task["tags"] = new_tags
                changed = True
        if changed:
            await store.async_save(data)


@callback
def async_register_services(hass: HomeAssistant) -> None:
    """Register entity services (on todo entities of this integration) and global ones."""
    for name, schema, func, response in ENTITY_SERVICES:
        service.async_register_platform_entity_service(
            hass,
            DOMAIN,
            name,
            entity_domain="todo",
            schema=schema,
            func=func,
            supports_response=response,
        )

    async def set_tag(call: ServiceCall) -> None:
        registry = await async_get_tag_registry(hass)
        registry.set_color(call.data["name"], call.data["color"])

    async def rename_tag(call: ServiceCall) -> None:
        registry = await async_get_tag_registry(hass)
        old = registry.find(call.data["name"])
        try:
            new = registry.rename(call.data["name"], call.data["new_name"])
        except KeyError as err:
            raise ServiceValidationError(f"Unknown tag {call.data['name']!r}") from err
        except ValueError as err:
            raise ServiceValidationError(str(err)) from err
        await _async_patch_unloaded_lists(
            hass, lambda tags: [new if t == old else t for t in tags]
        )

    async def delete_tag(call: ServiceCall) -> None:
        registry = await async_get_tag_registry(hass)
        old = registry.find(call.data["name"])
        try:
            registry.delete(call.data["name"])
        except KeyError as err:
            raise ServiceValidationError(f"Unknown tag {call.data['name']!r}") from err
        await _async_patch_unloaded_lists(hass, lambda tags: [t for t in tags if t != old])

    async def get_tags(call: ServiceCall) -> ServiceResponse:
        registry = await async_get_tag_registry(hass)
        return {"tags": registry.all()}

    hass.services.async_register(
        DOMAIN, "set_tag", set_tag,
        vol.Schema({vol.Required("name"): cv.string, vol.Required("color"): COLOR}),
    )
    hass.services.async_register(
        DOMAIN, "rename_tag", rename_tag,
        vol.Schema({vol.Required("name"): cv.string, vol.Required("new_name"): cv.string}),
    )
    hass.services.async_register(
        DOMAIN, "delete_tag", delete_tag, vol.Schema({vol.Required("name"): cv.string})
    )
    hass.services.async_register(
        DOMAIN, "get_tags", get_tags, vol.Schema({}), supports_response=SupportsResponse.ONLY
    )


def task_to_response(task: dict[str, Any]) -> dict[str, Any]:
    """A task as returned by services (a copy, safe to serialise)."""
    return {
        **task,
        "tags": list(task["tags"]),
        "subtasks": [dict(s) for s in task["subtasks"]],
        "history": [dict(h) for h in task["history"]],
    }
