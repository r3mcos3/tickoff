"""Services: task actions (on todo entities) and tag management (global)."""

from __future__ import annotations

from typing import Any

import voluptuous as vol
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

from .const import DOMAIN, PRIORITY_HIGH, PRIORITY_NONE
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
        try:
            registry.rename(call.data["name"], call.data["new_name"])
        except KeyError as err:
            raise ServiceValidationError(f"Unknown tag {call.data['name']!r}") from err
        except ValueError as err:
            raise ServiceValidationError(str(err)) from err

    async def delete_tag(call: ServiceCall) -> None:
        registry = await async_get_tag_registry(hass)
        try:
            registry.delete(call.data["name"])
        except KeyError as err:
            raise ServiceValidationError(f"Unknown tag {call.data['name']!r}") from err

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
