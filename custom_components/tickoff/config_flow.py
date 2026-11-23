"""Config flow: one config entry per task list."""

from __future__ import annotations

from typing import Any

import voluptuous as vol
from homeassistant.config_entries import ConfigFlow, ConfigFlowResult
from homeassistant.util import slugify

from .const import CONF_LIST_NAME, DOMAIN


class TasksConfigFlow(ConfigFlow, domain=DOMAIN):
    """Create a task list."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        if user_input is not None:
            name = user_input[CONF_LIST_NAME].strip()
            if not name:
                errors[CONF_LIST_NAME] = "name_required"
            else:
                await self.async_set_unique_id(slugify(name))
                self._abort_if_unique_id_configured()
                return self.async_create_entry(title=name, data={CONF_LIST_NAME: name})

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema({vol.Required(CONF_LIST_NAME): str}),
            errors=errors,
        )
