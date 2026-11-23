"""Global tag register (name -> colour), shared by every list."""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from typing import Any

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.storage import Store
from homeassistant.util.hass_dict import HassKey

from .const import (
    DOMAIN,
    SAVE_DELAY,
    STORAGE_VERSION,
    TAG_COLOR_PALETTE,
)

DATA_TAGS: HassKey[TagRegistry] = HassKey(f"{DOMAIN}_tags")


def normalize_tag(name: str) -> str:
    """Tags are case-insensitive for matching but keep the first spelling."""
    return name.strip()


class TagRegistry:
    """Tags with colour, shared across all lists.

    Task stores subscribe so renames and deletes ripple through the tasks.
    """

    def __init__(self, hass: HomeAssistant) -> None:
        self._store: Store[dict[str, Any]] = Store(hass, STORAGE_VERSION, f"{DOMAIN}.tags")
        self._tags: dict[str, dict[str, str]] = {}
        self._on_rename: list[Callable[[str, str], None]] = []
        self._on_delete: list[Callable[[str], None]] = []
        self._lock = asyncio.Lock()
        self._loaded = False

    async def async_ensure_loaded(self) -> None:
        """Load once, even when several list entries set up concurrently."""
        async with self._lock:
            if not self._loaded:
                data = await self._store.async_load()
                self._tags = (data or {}).get("tags", {})
                self._loaded = True

    async def async_flush(self) -> None:
        await self._store.async_save(self._data_to_save())

    @callback
    def _data_to_save(self) -> dict[str, Any]:
        return {"tags": self._tags}

    @callback
    def _changed(self) -> None:
        self._store.async_delay_save(self._data_to_save, SAVE_DELAY)

    @callback
    def subscribe(
        self, on_rename: Callable[[str, str], None], on_delete: Callable[[str], None]
    ) -> Callable[[], None]:
        self._on_rename.append(on_rename)
        self._on_delete.append(on_delete)

        @callback
        def _unsub() -> None:
            self._on_rename.remove(on_rename)
            self._on_delete.remove(on_delete)

        return _unsub

    @callback
    def all(self) -> dict[str, dict[str, str]]:
        return {name: dict(tag) for name, tag in self._tags.items()}

    @callback
    def find(self, name: str) -> str | None:
        """Return the registered spelling of a tag (case-insensitive)."""
        lowered = name.strip().lower()
        return next((n for n in self._tags if n.lower() == lowered), None)

    @callback
    def ensure(self, name: str) -> str:
        """Return the registered tag, creating it with the next palette colour."""
        name = normalize_tag(name)
        if (existing := self.find(name)) is not None:
            return existing
        color = TAG_COLOR_PALETTE[len(self._tags) % len(TAG_COLOR_PALETTE)]
        self._tags[name] = {"color": color}
        self._changed()
        return name

    @callback
    def set_color(self, name: str, color: str) -> str:
        name = self.ensure(name)
        self._tags[name]["color"] = color.lower()
        self._changed()
        return name

    @callback
    def rename(self, name: str, new_name: str) -> str:
        old = self.find(name)
        if old is None:
            raise KeyError(name)
        new_name = normalize_tag(new_name)
        clash = self.find(new_name)
        if clash is not None and clash != old:
            raise ValueError(f"tag {clash!r} already exists")
        self._tags[new_name] = self._tags.pop(old)
        self._changed()
        for cb in list(self._on_rename):
            cb(old, new_name)
        return new_name

    @callback
    def delete(self, name: str) -> None:
        old = self.find(name)
        if old is None:
            raise KeyError(name)
        del self._tags[old]
        self._changed()
        for cb in list(self._on_delete):
            cb(old)


async def async_get_tag_registry(hass: HomeAssistant) -> TagRegistry:
    """Return the (lazily loaded) global registry."""
    registry = hass.data.setdefault(DATA_TAGS, TagRegistry(hass))
    await registry.async_ensure_loaded()
    return registry
