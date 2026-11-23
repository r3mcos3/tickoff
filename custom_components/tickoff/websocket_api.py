"""Websocket API used by the Tickoff panel and card."""

from __future__ import annotations

from datetime import time
from typing import Any

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.event import async_track_time_change
from homeassistant.util import dt as dt_util

from .classify import classify
from .const import CONF_NOTIFY_TARGETS, CONF_NOTIFY_TIME, DEFAULT_NOTIFY_TIME, DOMAIN
from .hub import Hub, async_get_hub
from .notify import async_notify_targets, async_send
from .services import task_to_response
from .tags import async_get_tag_registry


@callback
def async_register_websocket(hass: HomeAssistant) -> None:
    websocket_api.async_register_command(hass, ws_subscribe)
    websocket_api.async_register_command(hass, ws_snapshot)
    websocket_api.async_register_command(hass, ws_settings_set)
    websocket_api.async_register_command(hass, ws_test_notify)


def _entry(hass: HomeAssistant) -> Any:
    return next(iter(hass.config_entries.async_entries(DOMAIN)), None)


def build_snapshot(hub: Hub, tags: dict[str, dict[str, str]]) -> dict[str, Any]:
    """Everything the UI needs: the tasks (classified), the global tags and the settings."""
    now = dt_util.now()
    entry = _entry(hub.hass)
    options = dict(entry.options) if entry else {}
    chosen = list(options.get(CONF_NOTIFY_TARGETS) or [])
    tasks: list[dict[str, Any]] = []
    entity_id = None
    for store in hub.stores.values():
        entity_id = hub.entity_id_for(store.entry_id)
        for task in store.tasks():
            item = task_to_response(task)
            item["state"] = classify(task, now)
            tasks.append(item)
    return {
        "now": now.isoformat(),
        "entity_id": entity_id,
        "tasks": tasks,
        "tags": tags,
        "settings": {
            "notify_targets": chosen,
            "notify_time": options.get(CONF_NOTIFY_TIME, DEFAULT_NOTIFY_TIME),
        },
        "notify_targets": async_notify_targets(hub.hass, chosen),
    }


@websocket_api.websocket_command({vol.Required("type"): "tickoff/snapshot"})
@websocket_api.async_response
async def ws_snapshot(hass: HomeAssistant, connection: Any, msg: dict[str, Any]) -> None:
    registry = await async_get_tag_registry(hass)
    connection.send_result(msg["id"], build_snapshot(async_get_hub(hass), registry.all()))


@websocket_api.websocket_command({vol.Required("type"): "tickoff/subscribe"})
@websocket_api.async_response
async def ws_subscribe(hass: HomeAssistant, connection: Any, msg: dict[str, Any]) -> None:
    """Push a fresh snapshot after every change (and every minute: today/overdue move)."""
    hub = async_get_hub(hass)
    registry = await async_get_tag_registry(hass)

    @callback
    def push() -> None:
        connection.send_message(
            websocket_api.event_message(msg["id"], build_snapshot(hub, registry.all()))
        )

    @callback
    def on_minute(_now: Any) -> None:
        push()

    unsubs = [
        hub.async_add_listener(push),
        registry.async_add_listener(push),
        async_track_time_change(hass, on_minute, second=0),
    ]

    @callback
    def unsubscribe() -> None:
        for unsub in unsubs:
            unsub()

    connection.subscriptions[msg["id"]] = unsubscribe
    connection.send_result(msg["id"])
    push()


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): "tickoff/settings_set",
        vol.Optional("notify_targets"): [cv.string],
        vol.Optional("notify_time"): cv.string,
    }
)
@websocket_api.async_response
async def ws_settings_set(hass: HomeAssistant, connection: Any, msg: dict[str, Any]) -> None:
    entry = _entry(hass)
    if entry is None:
        connection.send_error(msg["id"], "not_found", "Tickoff is not set up")
        return
    options = dict(entry.options)
    if "notify_targets" in msg:
        options[CONF_NOTIFY_TARGETS] = list(dict.fromkeys(msg["notify_targets"]))
    if "notify_time" in msg:
        try:
            time.fromisoformat(msg["notify_time"])
        except ValueError:
            connection.send_error(msg["id"], "invalid_time", "Use HH:MM:SS")
            return
        options[CONF_NOTIFY_TIME] = msg["notify_time"]
    hass.config_entries.async_update_entry(entry, options=options)
    connection.send_result(msg["id"])


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): "tickoff/test_notify"})
@websocket_api.async_response
async def ws_test_notify(hass: HomeAssistant, connection: Any, msg: dict[str, Any]) -> None:
    """Send one test message to the chosen targets (only when an admin presses the button)."""
    hub = async_get_hub(hass)
    targets = hub.notify_targets()
    if not targets:
        connection.send_error(msg["id"], "no_targets", "Choose at least one notification target")
        return
    sent = await async_send(hass, targets, "Tickoff", "Test notification from Tickoff ✅")
    connection.send_result(msg["id"], {"sent": sent, "targets": len(targets)})
