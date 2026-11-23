"""Websocket API used by the Tickoff dashboard card."""

from __future__ import annotations

from typing import Any

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.event import async_track_time_change
from homeassistant.util import dt as dt_util

from .classify import classify
from .hub import Hub, async_get_hub
from .services import task_to_response
from .tags import async_get_tag_registry


@callback
def async_register_websocket(hass: HomeAssistant) -> None:
    websocket_api.async_register_command(hass, ws_subscribe)
    websocket_api.async_register_command(hass, ws_snapshot)


def build_snapshot(hub: Hub, tags: dict[str, dict[str, str]]) -> dict[str, Any]:
    """Everything the card needs: lists with tasks (classified) and the global tags."""
    now = dt_util.now()
    lists = []
    for store in hub.stores.values():
        tasks = []
        for task in store.tasks():
            item = task_to_response(task)
            item["state"] = classify(task, now)
            tasks.append(item)
        lists.append(
            {
                "entry_id": store.entry_id,
                "entity_id": hub.entity_id_for(store.entry_id),
                "name": store.list_name,
                "tasks": tasks,
            }
        )
    return {"now": now.isoformat(), "lists": lists, "tags": tags}


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

    unsubs = [
        hub.async_add_listener(push),
        registry.async_add_listener(push),
        async_track_time_change(hass, lambda _now: push(), second=0),
    ]

    @callback
    def unsubscribe() -> None:
        for unsub in unsubs:
            unsub()

    connection.subscriptions[msg["id"]] = unsubscribe
    connection.send_result(msg["id"])
    push()
