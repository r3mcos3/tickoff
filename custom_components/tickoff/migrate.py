"""Migration from the multi-list versions (<= 0.2.0) to the single task collection."""

from __future__ import annotations

import logging
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.storage import Store

from .const import (
    CONF_KIND,
    CONF_LIST_NAME,
    CONF_NOTIFY_SERVICE,
    CONF_NOTIFY_TARGETS,
    CONF_NOTIFY_TIME,
    DOMAIN,
    KIND_LIST,
    KIND_MAIN,
    KIND_OVERVIEW,
    STORAGE_KEY_PREFIX,
    STORAGE_VERSION,
)

_LOGGER = logging.getLogger(__name__)


def _is_list(entry: Any) -> bool:
    kind = entry.data.get(CONF_KIND)
    return kind == KIND_LIST or (kind is None and CONF_LIST_NAME in entry.data)


async def async_migrate_legacy(hass: HomeAssistant) -> None:
    """Merge old lists into one collection. Runs before any entry is set up."""
    entries = hass.config_entries.async_entries(DOMAIN)
    lists = [e for e in entries if _is_list(e)]
    overviews = [e for e in entries if e.data.get(CONF_KIND) == KIND_OVERVIEW]
    if not lists and not overviews:
        return

    overview_options: dict[str, Any] = dict(overviews[0].options) if overviews else {}
    if lists:
        main = lists[0]
        main_options = dict(main.options)
        tasks: list[dict[str, Any]] = []
        for entry in lists:
            store: Store[dict[str, Any]] = Store(
                hass, STORAGE_VERSION, f"{STORAGE_KEY_PREFIX}{entry.entry_id}"
            )
            data = await store.async_load() or {}
            tasks.extend(sorted(data.get("tasks", []), key=lambda t: t.get("position", 0)))
        for position, task in enumerate(tasks):
            task["position"] = position
        main_store: Store[dict[str, Any]] = Store(
            hass, STORAGE_VERSION, f"{STORAGE_KEY_PREFIX}{main.entry_id}"
        )
        await main_store.async_save({"tasks": tasks})
        _LOGGER.info("Merged %s lists (%s tasks) into one Tickoff collection", len(lists), len(tasks))
    else:  # only an overview entry exists: it becomes the (empty) main entry
        main = overviews[0]
        main_options = {}
        overviews = []

    targets: list[str] = []
    for service in (main_options.get(CONF_NOTIFY_SERVICE), overview_options.get(CONF_NOTIFY_SERVICE)):
        if service and f"service:{service}" not in targets:
            targets.append(f"service:{service}")
    options: dict[str, Any] = {CONF_NOTIFY_TARGETS: targets}
    if overview_options.get(CONF_NOTIFY_TIME):
        options[CONF_NOTIFY_TIME] = overview_options[CONF_NOTIFY_TIME]

    for entry in [e for e in lists if e is not main] + overviews:
        await hass.config_entries.async_remove(entry.entry_id)

    hass.config_entries.async_update_entry(
        main, title="Tickoff", data={CONF_KIND: KIND_MAIN}, options=options, unique_id=KIND_MAIN
    )

    registry = er.async_get(hass)
    wanted = {
        ("todo", main.entry_id): "todo.tickoff",
        ("sensor", f"{main.entry_id}_open"): "sensor.tickoff_open",
        ("sensor", f"{main.entry_id}_today"): "sensor.tickoff_today",
        ("sensor", f"{main.entry_id}_overdue"): "sensor.tickoff_overdue",
    }
    for (domain, unique_id), new_id in wanted.items():
        entity_id = registry.async_get_entity_id(domain, DOMAIN, unique_id)
        if entity_id and entity_id != new_id and registry.async_get(new_id) is None:
            registry.async_update_entity(entity_id, new_entity_id=new_id)
