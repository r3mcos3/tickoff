"""Config flow tests."""

from homeassistant.config_entries import SOURCE_USER
from homeassistant.data_entry_flow import FlowResultType

from custom_components.ha_tasks.const import DOMAIN


async def test_create_list(hass):
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": SOURCE_USER})
    assert result["type"] is FlowResultType.FORM
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {"name": "  Chores "}
    )
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["title"] == "Chores"
    assert result["data"] == {"name": "Chores"}


async def test_duplicate_name_aborts(hass, mock_entry):
    mock_entry.add_to_hass(hass)
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": SOURCE_USER})
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {"name": "groceries"}
    )
    assert result["type"] is FlowResultType.ABORT
    assert result["reason"] == "already_configured"


async def test_blank_name_shows_error(hass):
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": SOURCE_USER})
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {"name": "   "})
    assert result["type"] is FlowResultType.FORM
    assert result["errors"] == {"name": "name_required"}
