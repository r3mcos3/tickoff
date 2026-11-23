"""Config flow: a single Tickoff entry with optional notification targets."""

from __future__ import annotations

from typing import Any

import voluptuous as vol
from homeassistant.config_entries import ConfigEntry, ConfigFlow, ConfigFlowResult, OptionsFlow
from homeassistant.core import callback
from homeassistant.helpers.selector import (
    SelectOptionDict,
    SelectSelector,
    SelectSelectorConfig,
    SelectSelectorMode,
    TimeSelector,
)

from .const import (
    CONF_KIND,
    CONF_NOTIFY_TARGETS,
    CONF_NOTIFY_TIME,
    DEFAULT_NOTIFY_TIME,
    DOMAIN,
    KIND_MAIN,
)
from .notify import async_notify_targets


def _targets_selector(hass: Any, keep: list[str] | None = None) -> SelectSelector:
    return SelectSelector(
        SelectSelectorConfig(
            options=[
                SelectOptionDict(value=t["value"], label=t["label"])
                for t in async_notify_targets(hass, keep)
            ],
            multiple=True,
            mode=SelectSelectorMode.DROPDOWN,
        )
    )


class TickoffConfigFlow(ConfigFlow, domain=DOMAIN):
    """Set up Tickoff once."""

    VERSION = 1

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> TickoffOptionsFlow:
        return TickoffOptionsFlow()

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")
        if user_input is not None:
            await self.async_set_unique_id(KIND_MAIN)
            options: dict[str, Any] = {}
            if user_input.get(CONF_NOTIFY_TARGETS):
                options[CONF_NOTIFY_TARGETS] = user_input[CONF_NOTIFY_TARGETS]
            return self.async_create_entry(title="Tickoff", data={CONF_KIND: KIND_MAIN}, options=options)
        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema(
                {vol.Optional(CONF_NOTIFY_TARGETS, default=[]): _targets_selector(self.hass)}
            ),
        )


class TickoffOptionsFlow(OptionsFlow):
    """Where due-date notifications go (Telegram, phone, ...) and at what time."""

    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        if user_input is not None:
            return self.async_create_entry(data=user_input)
        current = list(self.config_entry.options.get(CONF_NOTIFY_TARGETS) or [])
        schema = vol.Schema(
            {
                vol.Optional(CONF_NOTIFY_TARGETS, default=current): _targets_selector(self.hass, current),
                vol.Optional(CONF_NOTIFY_TIME, default=DEFAULT_NOTIFY_TIME): TimeSelector(),
            }
        )
        return self.async_show_form(
            step_id="init",
            data_schema=self.add_suggested_values_to_schema(schema, self.config_entry.options),
        )
