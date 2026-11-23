"""Serve the Tickoff card and sidebar panel; both are shipped by the integration itself."""

from __future__ import annotations

import json
from pathlib import Path

from homeassistant.components import panel_custom
from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant

URL_BASE = "/tickoff_static"
CARD_FILE = "tickoff-card.js"
PANEL_FILE = "tickoff-panel.js"
PANEL_PATH = "tickoff"


async def async_setup_frontend(hass: HomeAssistant) -> None:
    """Serve www/, load the card on every dashboard and add the "Tickoff" sidebar panel."""
    www = Path(__file__).parent / "www"
    version = json.loads((Path(__file__).parent / "manifest.json").read_text())["version"]
    await hass.http.async_register_static_paths(
        [
            StaticPathConfig(f"{URL_BASE}/{name}", str(www / name), cache_headers=False)
            for name in (CARD_FILE, PANEL_FILE)
        ]
    )
    add_extra_js_url(hass, f"{URL_BASE}/{CARD_FILE}?v={version}")
    await panel_custom.async_register_panel(
        hass,
        frontend_url_path=PANEL_PATH,
        webcomponent_name="tickoff-panel",
        sidebar_title="Tickoff",
        sidebar_icon="mdi:checkbox-marked-circle-outline",
        module_url=f"{URL_BASE}/{PANEL_FILE}?v={version}",
        require_admin=False,
    )
