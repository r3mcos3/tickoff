"""Notification targets: notify.* services and notify entities (Telegram, mobile app, ...)."""

from __future__ import annotations

import logging
from typing import Any

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import entity_registry as er

_LOGGER = logging.getLogger(__name__)

SERVICE = "service"
ENTITY = "entity"
# notify services that are not "send a message somewhere" services
_EXCLUDED_SERVICES = {"send_message"}


def _is_telegram(*texts: str | None) -> bool:
    return any(t and "telegram" in t.lower() for t in texts)


@callback
def async_notify_targets(hass: HomeAssistant, keep: list[str] | None = None) -> list[dict[str, Any]]:
    """All places a notification can go, Telegram first.

    A target is ``service:<name>`` (a ``notify.<name>`` service, e.g. ``mobile_app_phone``) or
    ``entity:<entity_id>`` (a notify entity, which is what the Telegram bot integration creates;
    sent through ``notify.send_message``). Already chosen targets that are no longer available are
    kept in the list so a setting is never silently lost.
    """
    registry = er.async_get(hass)
    targets: list[dict[str, Any]] = []
    for name in sorted(set(hass.services.async_services_for_domain("notify")) - _EXCLUDED_SERVICES):
        telegram = _is_telegram(name)
        targets.append(
            {
                "value": f"{SERVICE}:{name}",
                "label": f"{'Telegram · ' if telegram else ''}notify.{name}",
                "telegram": telegram,
            }
        )
    for entity_id in sorted(hass.states.async_entity_ids("notify")):
        state = hass.states.get(entity_id)
        entry = registry.async_get(entity_id)
        friendly = (state.attributes.get("friendly_name") if state else None) or entity_id
        telegram = _is_telegram(entity_id, friendly, entry.platform if entry else None)
        targets.append(
            {
                "value": f"{ENTITY}:{entity_id}",
                "label": f"{'Telegram · ' if telegram else ''}{friendly}",
                "telegram": telegram,
            }
        )
    known = {t["value"] for t in targets}
    for value in keep or []:
        if value not in known:
            targets.append({"value": value, "label": f"{value} (unavailable)", "telegram": False})
    targets.sort(key=lambda t: (not t["telegram"], t["label"].lower()))
    return targets


async def async_send(hass: HomeAssistant, targets: list[str], title: str, message: str) -> int:
    """Send to every target; one broken target never stops the others. Returns the number sent."""
    sent = 0
    for target in targets:
        kind, _, name = target.partition(":")
        try:
            if kind == SERVICE and hass.services.has_service("notify", name):
                await hass.services.async_call(
                    "notify", name, {"title": title, "message": message}, blocking=True
                )
            elif kind == ENTITY and hass.services.has_service("notify", "send_message"):
                await hass.services.async_call(
                    "notify",
                    "send_message",
                    {"entity_id": name, "title": title, "message": message},
                    blocking=True,
                )
            else:
                _LOGGER.warning("Notification target %s is not available; message skipped", target)
                continue
            sent += 1
        except Exception:
            _LOGGER.exception("Sending a notification to %s failed", target)
    return sent
