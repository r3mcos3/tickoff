"""Register the Tickoff card as a frontend resource (served by the integration itself)."""

from __future__ import annotations

import json
from pathlib import Path

from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant

URL_BASE = "/tickoff_static"
CARD_FILE = "tickoff-card.js"


async def async_setup_frontend(hass: HomeAssistant) -> None:
    """Serve www/ and load the card on every dashboard (storage and YAML mode alike)."""
    www = Path(__file__).parent / "www"
    version = json.loads((Path(__file__).parent / "manifest.json").read_text())["version"]
    await hass.http.async_register_static_paths(
        [StaticPathConfig(f"{URL_BASE}/{CARD_FILE}", str(www / CARD_FILE), cache_headers=False)]
    )
    add_extra_js_url(hass, f"{URL_BASE}/{CARD_FILE}?v={version}")
