"""Config flow: one config entry per task list, with an optional notify service."""

from __future__ import annotations

from typing import Any

import voluptuous as vol
from homeassistant.config_entries import (
    ConfigEntry,
    ConfigFlow,
    ConfigFlowResult,
    OptionsFlowWithReload,
)
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.selector import (
    SelectSelector,
    SelectSelectorConfig,
    SelectSelectorMode,
)
from homeassistant.util import slugify

from .const import CONF_LIST_NAME, CONF_NOTIFY_SERVICE, DOMAIN

# Legacy notify services that are not "send a message to a target" services
_EXCLUDED_NOTIFY = {"send_message"}


@callback
def notify_service_options(hass: HomeAssistant) -> list[str]:
    """Names of available notify.* services (without the domain)."""
    return sorted(set(hass.services.async_services_for_domain("notify")) - _EXCLUDED_NOTIFY)


def _notify_selector(hass: HomeAssistant) -> SelectSelector:
    return SelectSelector(
        SelectSelectorConfig(
            options=notify_service_options(hass),
            custom_value=True,
            mode=SelectSelectorMode.DROPDOWN,
        )
    )


class TickoffConfigFlow(ConfigFlow, domain=DOMAIN):
    """Create a task list."""

    VERSION = 1

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> TickoffOptionsFlow:
        return TickoffOptionsFlow()

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
                options = {}
                if service := user_input.get(CONF_NOTIFY_SERVICE):
                    options[CONF_NOTIFY_SERVICE] = service
                return self.async_create_entry(
                    title=name, data={CONF_LIST_NAME: name}, options=options
                )

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_LIST_NAME): str,
                    vol.Optional(CONF_NOTIFY_SERVICE): _notify_selector(self.hass),
                }
            ),
            errors=errors,
        )


class TickoffOptionsFlow(OptionsFlowWithReload):
    """Change the notify service of a list."""

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        if user_input is not None:
            return self.async_create_entry(data=user_input)

        schema = vol.Schema(
            {vol.Optional(CONF_NOTIFY_SERVICE): _notify_selector(self.hass)}
        )
        return self.async_show_form(
            step_id="init",
            data_schema=self.add_suggested_values_to_schema(
                schema, self.config_entry.options
            ),
        )
