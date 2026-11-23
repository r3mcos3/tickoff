"""Sidebar panel: registration and the management websocket commands."""

from homeassistant.components.frontend import DATA_PANELS

from custom_components.tickoff.const import DOMAIN

ENTITY = "todo.tickoff_groceries"


async def ws(client, id_, payload):
    await client.send_json({"id": id_, **payload})
    return await client.receive_json()


async def test_panel_registered_in_sidebar(hass, setup_entry):
    panel = hass.data[DATA_PANELS]["tickoff"]
    assert panel.sidebar_title == "Tickoff"
    assert panel.sidebar_icon == "mdi:checkbox-marked-circle-outline"
    assert panel.require_admin is False
    assert panel.config["_panel_custom"]["name"] == "tickoff-panel"
    assert "/tickoff_static/tickoff-panel.js" in panel.config["_panel_custom"]["module_url"]


async def test_panel_files_are_served(hass, hass_client, setup_entry):
    client = await hass_client()
    for name in ("tickoff-panel.js", "tickoff-card.js"):
        resp = await client.get(f"/tickoff_static/{name}")
        assert resp.status == 200


async def test_create_rename_notify_delete_list(hass, hass_ws_client, setup_entry):
    client = await hass_ws_client(hass)
    msg = await ws(client, 1, {"type": "tickoff/list_create", "name": "Garden", "notify_service": "phone"})
    assert msg["success"]
    entry_id = msg["result"]["entry_id"]
    await hass.async_block_till_done()
    assert hass.states.get("todo.tickoff_garden").attributes["friendly_name"] == "Garden"
    entry = hass.config_entries.async_get_entry(entry_id)
    assert entry.options == {"notify_service": "phone"}

    dup = await ws(client, 2, {"type": "tickoff/list_create", "name": "garden"})
    assert not dup["success"] and dup["error"]["code"] == "already_exists"
    blank = await ws(client, 3, {"type": "tickoff/list_create", "name": "  "})
    assert not blank["success"] and blank["error"]["code"] == "invalid_name"

    # rename keeps entity_id, updates the friendly name, keeps the tasks
    await hass.services.async_call(
        DOMAIN, "add_task", {"entity_id": "todo.tickoff_garden", "title": "Mow"}, blocking=True
    )
    msg = await ws(client, 4, {"type": "tickoff/list_update", "entry_id": entry_id, "name": "Yard"})
    assert msg["success"]
    await hass.async_block_till_done()
    state = hass.states.get("todo.tickoff_garden")
    assert state.attributes["friendly_name"] == "Yard" and state.state == "1"
    clash = await ws(client, 5, {"type": "tickoff/list_update", "entry_id": entry_id, "name": "groceries"})
    assert clash["error"]["code"] == "already_exists"

    # clear / change the notify service
    await ws(client, 6, {"type": "tickoff/list_update", "entry_id": entry_id, "notify_service": None})
    assert entry.options == {}
    await ws(client, 7, {"type": "tickoff/list_update", "entry_id": entry_id, "notify_service": "mine"})
    assert entry.options == {"notify_service": "mine"}

    snap = (await ws(client, 8, {"type": "tickoff/snapshot"}))["result"]
    garden = next(lst for lst in snap["lists"] if lst["entry_id"] == entry_id)
    assert garden["name"] == "Yard" and garden["notify_service"] == "mine"

    gone = await ws(client, 9, {"type": "tickoff/list_delete", "entry_id": entry_id})
    assert gone["success"]
    await hass.async_block_till_done()
    assert hass.states.get("todo.tickoff_garden") is None
    assert hass.config_entries.async_get_entry(entry_id) is None
    unknown = await ws(client, 10, {"type": "tickoff/list_delete", "entry_id": entry_id})
    assert unknown["error"]["code"] == "not_found"


async def test_cannot_touch_overview_entry_as_list(hass, hass_ws_client, setup_entry):
    await hass.async_block_till_done()
    overview = next(e for e in hass.config_entries.async_entries(DOMAIN) if e.data["kind"] == "overview")
    client = await hass_ws_client(hass)
    msg = await ws(client, 1, {"type": "tickoff/list_delete", "entry_id": overview.entry_id})
    assert msg["error"]["code"] == "not_found"


async def test_settings_roundtrip(hass, hass_ws_client, setup_entry):
    await hass.async_block_till_done()
    client = await hass_ws_client(hass)
    snap = (await ws(client, 1, {"type": "tickoff/snapshot"}))["result"]
    assert snap["settings"] == {"notify_service": "", "notify_time": "08:00:00"}
    ok = await ws(client, 2, {"type": "tickoff/settings_set", "notify_service": "family", "notify_time": "07:15:00"})
    assert ok["success"]
    snap = (await ws(client, 3, {"type": "tickoff/snapshot"}))["result"]
    assert snap["settings"] == {"notify_service": "family", "notify_time": "07:15:00"}
    bad = await ws(client, 4, {"type": "tickoff/settings_set", "notify_time": "soon"})
    assert bad["error"]["code"] == "invalid_time"
    await ws(client, 5, {"type": "tickoff/settings_set", "notify_service": None})
    snap = (await ws(client, 6, {"type": "tickoff/snapshot"}))["result"]
    assert snap["settings"]["notify_service"] == ""


async def test_management_requires_admin(hass, hass_ws_client, hass_admin_user, setup_entry):
    hass_admin_user.groups = []  # demote to a normal user
    client = await hass_ws_client(hass)
    msg = await ws(client, 1, {"type": "tickoff/list_create", "name": "Nope"})
    assert not msg["success"] and msg["error"]["code"] == "unauthorized"
    # reading is allowed for everyone
    assert (await ws(client, 2, {"type": "tickoff/snapshot"}))["success"]
