"""Todo platform tests."""


from homeassistant.components.todo import DOMAIN as TODO_DOMAIN
from homeassistant.components.todo import TodoServices
from homeassistant.const import ATTR_ENTITY_ID

ENTITY = "todo.groceries"


async def _call(hass, service, data):
    await hass.services.async_call(
        TODO_DOMAIN, service, {ATTR_ENTITY_ID: ENTITY, **data}, blocking=True
    )


async def _items(hass):
    resp = await hass.services.async_call(
        TODO_DOMAIN, TodoServices.GET_ITEMS, {ATTR_ENTITY_ID: ENTITY},
        blocking=True, return_response=True,
    )
    return resp[ENTITY]["items"]


async def test_entity_created(hass, setup_entry):
    state = hass.states.get(ENTITY)
    assert state is not None
    assert state.state == "0"


async def test_add_with_notes_and_due(hass, setup_entry):
    await _call(hass, TodoServices.ADD_ITEM, {
        "item": "Milk", "description": "2 liter", "due_date": "2026-12-01"})
    await _call(hass, TodoServices.ADD_ITEM, {
        "item": "Call", "due_datetime": "2026-12-02 09:30:00"})
    items = await _items(hass)
    assert items[0]["summary"] == "Milk"
    assert items[0]["description"] == "2 liter"
    assert items[0]["due"] == "2026-12-01"
    assert items[1]["due"].startswith("2026-12-02")
    assert hass.states.get(ENTITY).state == "2"


async def test_complete_and_reopen(hass, setup_entry):
    await _call(hass, TodoServices.ADD_ITEM, {"item": "Milk"})
    await _call(hass, TodoServices.UPDATE_ITEM, {"item": "Milk", "status": "completed"})
    assert (await _items(hass))[0]["status"] == "completed"
    assert hass.states.get(ENTITY).state == "0"
    await _call(hass, TodoServices.UPDATE_ITEM, {"item": "Milk", "status": "needs_action"})
    assert (await _items(hass))[0]["status"] == "needs_action"


async def test_rename_and_clear_due(hass, setup_entry):
    await _call(hass, TodoServices.ADD_ITEM, {"item": "Milk", "due_date": "2026-12-01"})
    await _call(hass, TodoServices.UPDATE_ITEM, {"item": "Milk", "rename": "Oat milk"})
    item = (await _items(hass))[0]
    assert item["summary"] == "Oat milk"
    assert item["due"] == "2026-12-01"
    await _call(hass, TodoServices.UPDATE_ITEM, {"item": "Oat milk", "due_date": None})
    assert "due" not in (await _items(hass))[0]


async def test_remove_and_remove_completed(hass, setup_entry):
    for t in ("a", "b", "c"):
        await _call(hass, TodoServices.ADD_ITEM, {"item": t})
    await _call(hass, TodoServices.UPDATE_ITEM, {"item": "b", "status": "completed"})
    await _call(hass, TodoServices.REMOVE_COMPLETED_ITEMS, {})
    assert [i["summary"] for i in await _items(hass)] == ["a", "c"]
    await _call(hass, TodoServices.REMOVE_ITEM, {"item": ["a"]})
    assert [i["summary"] for i in await _items(hass)] == ["c"]


async def test_tasks_survive_reload(hass, setup_entry):
    await _call(hass, TodoServices.ADD_ITEM, {"item": "Keep me"})
    await hass.config_entries.async_reload(setup_entry.entry_id)
    await hass.async_block_till_done()
    assert [i["summary"] for i in await _items(hass)] == ["Keep me"]
