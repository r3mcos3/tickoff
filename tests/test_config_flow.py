"""Config flow tests."""

from homeassistant.config_entries import SOURCE_USER
from homeassistant.data_entry_flow import FlowResultType
from pytest_homeassistant_custom_component.common import async_mock_service

from custom_components.tickoff.const import DOMAIN


async def test_single_entry_created(hass):
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": SOURCE_USER})
    assert result["type"] is FlowResultType.FORM
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {})
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["title"] == "Tickoff"
    assert result["data"] == {"kind": "main"}
    await hass.async_block_till_done()
    assert hass.states.get("todo.tickoff") is not None
    assert hass.states.get("sensor.tickoff_open") is not None


async def test_create_with_notification_targets(hass):
    async_mock_service(hass, "notify", "mobile_app_phone")
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": SOURCE_USER})
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {"notify_targets": ["service:mobile_app_phone"]}
    )
    assert result["options"] == {"notify_targets": ["service:mobile_app_phone"]}


async def test_second_setup_is_refused(hass, setup_entry):
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": SOURCE_USER})
    assert result["type"] is FlowResultType.ABORT
    assert result["reason"] == "single_instance_allowed"


async def test_options_flow_sets_targets_and_time(hass, setup_entry):
    async_mock_service(hass, "notify", "telegram")
    result = await hass.config_entries.options.async_init(setup_entry.entry_id)
    assert result["type"] is FlowResultType.FORM
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {"notify_targets": ["service:telegram"], "notify_time": "07:30:00"}
    )
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert setup_entry.options == {"notify_targets": ["service:telegram"], "notify_time": "07:30:00"}
