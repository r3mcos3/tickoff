"""Update entity: release check and self-install from GitHub."""

from __future__ import annotations

import io
import json
import zipfile
from pathlib import Path
from unittest.mock import patch

import pytest
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import issue_registry as ir
from pytest_homeassistant_custom_component.common import async_fire_time_changed

from custom_components.tickoff import updater
from custom_components.tickoff.const import DOMAIN

LATEST = "https://api.github.com/repos/r3mcos3/tickoff/releases/latest"
ENTITY = "update.tickoff_update"
REAL_VERSION = json.loads((Path(updater.__file__).parent / "manifest.json").read_text())["version"]


def release(version="9.9.9", body="Adds things\n\nLonger notes"):
    return {"tag_name": f"v{version}", "html_url": f"https://github.com/r3mcos3/tickoff/releases/tag/v{version}",
            "body": body, "published_at": "2026-12-01T10:00:00Z"}


def make_zip(version="9.9.9", *, extra=None, manifest=None, drop=(), prefix="r3mcos3-tickoff-abc123/custom_components/tickoff/"):
    manifest = manifest or {"domain": "tickoff", "name": "Tickoff", "version": version}
    files = {"manifest.json": json.dumps(manifest), "__init__.py": "# new code", "www/tickoff-card.js": "// new card"}
    files.update(extra or {})
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("r3mcos3-tickoff-abc123/README.md", "readme")
        z.writestr("r3mcos3-tickoff-abc123/tests/test_x.py", "ignored")
        for name, content in files.items():
            if name not in drop:
                z.writestr(prefix + name, content)
    return buf.getvalue()


@pytest.fixture
def fake_install(tmp_path):
    """A throw-away copy of the integration: the real source tree must never be overwritten."""
    target = tmp_path / "config" / "custom_components" / "tickoff"
    target.mkdir(parents=True)
    (target / "manifest.json").write_text(json.dumps({"domain": "tickoff", "version": "0.0.1"}))
    (target / "__init__.py").write_text("# old code")
    (target / "www").mkdir()
    (target / "www" / "tickoff-card.js").write_text("// old card")
    with (
        patch.object(updater, "integration_dir", return_value=target),
        patch.object(updater, "backup_root", return_value=tmp_path / "storage" / "tickoff_backup"),
        patch.object(updater, "staging_root", return_value=tmp_path / "storage" / "tickoff_staging"),
    ):
        yield target


async def setup_with_release(hass, aioclient_mock, mock_entry, **kw):
    aioclient_mock.get(LATEST, json=release(**kw))
    mock_entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(mock_entry.entry_id)
    await hass.async_block_till_done()


async def test_update_available_with_release_notes(hass, aioclient_mock, mock_entry):
    await setup_with_release(hass, aioclient_mock, mock_entry)
    state = hass.states.get(ENTITY)
    assert state.state == "on"
    assert state.attributes["installed_version"] == REAL_VERSION
    assert state.attributes["latest_version"] == "9.9.9"
    assert state.attributes["title"] == "Tickoff"
    assert state.attributes["release_url"].endswith("/releases/tag/v9.9.9")
    assert state.attributes["release_summary"].startswith("Adds things")
    assert state.attributes["restart_required"] is False
    assert state.attributes["friendly_name"] == "Tickoff Update"
    assert state.attributes["supported_features"] & 1  # INSTALL


async def test_up_to_date(hass, aioclient_mock, mock_entry):
    await setup_with_release(hass, aioclient_mock, mock_entry, version=REAL_VERSION)
    assert hass.states.get(ENTITY).state == "off"


async def test_github_unreachable_does_not_break_setup(hass, aioclient_mock, mock_entry):
    aioclient_mock.get(LATEST, status=500)
    mock_entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(mock_entry.entry_id)
    await hass.async_block_till_done()
    state = hass.states.get(ENTITY)
    assert state.state == "off" and state.attributes["installed_version"] == REAL_VERSION
    assert hass.states.get("todo.tickoff") is not None  # the rest works as usual


async def test_no_release_yet_and_bad_tag(hass, aioclient_mock, mock_entry):
    aioclient_mock.get(LATEST, status=404)
    mock_entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(mock_entry.entry_id)
    await hass.async_block_till_done()
    assert hass.states.get(ENTITY).state == "off"
    with pytest.raises(updater.UpdateError):
        aioclient_mock.clear_requests()
        aioclient_mock.get(LATEST, json={"tag_name": "nightly-build"})
        await updater.async_fetch_latest(hass)


async def test_rechecks_periodically(hass, aioclient_mock, mock_entry, freezer):
    await setup_with_release(hass, aioclient_mock, mock_entry, version=REAL_VERSION)
    assert hass.states.get(ENTITY).state == "off"
    aioclient_mock.clear_requests()
    aioclient_mock.get(LATEST, json=release("9.9.9"))
    freezer.tick(7 * 3600)
    async_fire_time_changed(hass)
    await hass.async_block_till_done()
    assert hass.states.get(ENTITY).state == "on"


async def test_release_notes_service(hass, aioclient_mock, mock_entry, hass_ws_client):
    await setup_with_release(hass, aioclient_mock, mock_entry)
    client = await hass_ws_client(hass)
    await client.send_json({"id": 1, "type": "update/release_notes", "entity_id": ENTITY})
    msg = await client.receive_json()
    assert msg["result"] == "Adds things\n\nLonger notes"


async def test_install_replaces_files_keeps_backup_and_asks_for_restart(hass, aioclient_mock, mock_entry, fake_install):
    await setup_with_release(hass, aioclient_mock, mock_entry)
    aioclient_mock.get("https://api.github.com/repos/r3mcos3/tickoff/zipball/v9.9.9", content=make_zip("9.9.9"))
    await hass.services.async_call("update", "install", {"entity_id": ENTITY}, blocking=True)
    await hass.async_block_till_done()

    assert (fake_install / "__init__.py").read_text() == "# new code"
    assert (fake_install / "www" / "tickoff-card.js").read_text() == "// new card"
    assert json.loads((fake_install / "manifest.json").read_text())["version"] == "9.9.9"
    backup = updater.backup_root(hass) / "0.0.1"
    assert (backup / "__init__.py").read_text() == "# old code"  # previous version kept for a manual rollback
    assert not updater.staging_root(hass).exists()

    state = hass.states.get(ENTITY)
    assert state.attributes["installed_version"] == "9.9.9" and state.state == "off"
    assert state.attributes["restart_required"] is True
    issue = ir.async_get(hass).async_get_issue(DOMAIN, "restart_required")
    assert issue is not None and issue.is_fixable and issue.translation_placeholders == {"version": "9.9.9"}
    # only the fixed repository was contacted
    assert all(str(url).startswith("https://api.github.com/repos/r3mcos3/tickoff/") for _, url, *_ in aioclient_mock.mock_calls)


async def test_only_the_latest_backup_is_kept(hass, fake_install, tmp_path):
    backup_dir = tmp_path / "bk"
    (backup_dir / "0.0.0").mkdir(parents=True)
    (backup_dir / "0.0.0" / "x").write_text("older")
    files = updater.extract_release(make_zip("9.9.9"), "9.9.9")
    await hass.async_add_executor_job(updater.install_files, files, fake_install, backup_dir,
                                      tmp_path / "stage", "0.0.1")
    assert [p.name for p in backup_dir.iterdir()] == ["0.0.1"]


@pytest.mark.parametrize(
    ("data", "message"),
    [
        (b"not a zip", "not a valid zip"),
        (make_zip("9.9.9", drop=("manifest.json",)), "does not contain the Tickoff integration"),
        (make_zip("9.9.9", drop=("__init__.py",)), "does not contain the Tickoff integration"),
        (make_zip("9.9.9", manifest={"domain": "other", "version": "9.9.9"}), "not the Tickoff integration"),
        (make_zip("9.9.9", manifest={"domain": "tickoff", "version": "1.0.0"}), "expected '9.9.9'"),
        (make_zip("9.9.9", extra={"../evil.py": "x"}), "Unsafe path"),
        (make_zip("9.9.9", extra={"a/../../evil.py": "x"}), "Unsafe path"),
        (make_zip("9.9.9", extra={"big.bin": "x" * (9 * 1024 * 1024)}), "unexpected size"),
    ],
)
def test_bad_archives_are_refused(data, message):
    with pytest.raises(updater.UpdateError, match=message):
        updater.extract_release(data, "9.9.9")


async def test_refused_archive_leaves_the_install_untouched(hass, aioclient_mock, mock_entry, fake_install):
    await setup_with_release(hass, aioclient_mock, mock_entry)
    aioclient_mock.get("https://api.github.com/repos/r3mcos3/tickoff/zipball/v9.9.9",
                       content=make_zip("9.9.9", manifest={"domain": "tickoff", "version": "1.2.3"}))
    with pytest.raises(HomeAssistantError, match="expected"):
        await hass.services.async_call("update", "install", {"entity_id": ENTITY}, blocking=True)
    assert (fake_install / "__init__.py").read_text() == "# old code"
    assert not updater.backup_root(hass).exists()
    assert hass.states.get(ENTITY).attributes["restart_required"] is False
    assert ir.async_get(hass).async_get_issue(DOMAIN, "restart_required") is None


async def test_download_failure_and_size_limit(hass, aioclient_mock, mock_entry, fake_install):
    await setup_with_release(hass, aioclient_mock, mock_entry)
    aioclient_mock.get("https://api.github.com/repos/r3mcos3/tickoff/zipball/v9.9.9", status=404)
    with pytest.raises(HomeAssistantError, match="HTTP 404"):
        await hass.services.async_call("update", "install", {"entity_id": ENTITY}, blocking=True)
    aioclient_mock.clear_requests()
    aioclient_mock.get("https://api.github.com/repos/r3mcos3/tickoff/zipball/v9.9.9", content=b"x" * (updater.MAX_DOWNLOAD + 10))
    with pytest.raises(updater.UpdateError, match="large"):
        await updater.async_download(hass, "9.9.9")
    with pytest.raises(updater.UpdateError, match="Invalid version"):
        await updater.async_download(hass, "../../etc/passwd")
    assert (fake_install / "__init__.py").read_text() == "# old code"


async def test_failed_swap_is_rolled_back(hass, fake_install, tmp_path):
    files = updater.extract_release(make_zip("9.9.9"), "9.9.9")
    real_move = updater.shutil.move
    calls = {"n": 0}

    def flaky_move(src, dst):
        calls["n"] += 1
        if calls["n"] == 2:  # the move of the new files into place
            raise OSError("disk full")
        return real_move(src, dst)

    backup_dir = tmp_path / "bk"
    with patch.object(updater.shutil, "move", flaky_move), pytest.raises(updater.UpdateError, match="previous version was restored"):
        await hass.async_add_executor_job(updater.install_files, files, fake_install, backup_dir,
                                          tmp_path / "stage", "0.0.1")
    assert (fake_install / "__init__.py").read_text() == "# old code"
    assert json.loads((fake_install / "manifest.json").read_text())["version"] == "0.0.1"


async def test_installing_the_current_version_is_a_noop(hass, aioclient_mock, mock_entry, fake_install):
    await setup_with_release(hass, aioclient_mock, mock_entry, version="0.0.1")  # same as the (fake) installed one
    assert hass.states.get(ENTITY).state == "off"
    with pytest.raises(HomeAssistantError, match="No update available"):  # Home Assistant itself refuses
        await hass.services.async_call("update", "install", {"entity_id": ENTITY}, blocking=True)
    assert (fake_install / "__init__.py").read_text() == "# old code"


async def test_restart_repair_flow_restarts_only_after_confirmation(hass):
    from homeassistant.helpers import issue_registry as ir_
    from pytest_homeassistant_custom_component.common import async_mock_service

    from custom_components.tickoff.repairs import async_create_fix_flow

    restarts = async_mock_service(hass, "homeassistant", "restart")
    flow = await async_create_fix_flow(hass, "restart_required", None)
    flow.hass = hass
    result = await flow.async_step_init()
    assert result["type"].value == "form" and not restarts
    result = await flow.async_step_confirm({})
    assert result["type"].value == "create_entry" and len(restarts) == 1
    assert ir_ is not None


async def test_restart_issue_cleared_on_start(hass, aioclient_mock, mock_entry):
    ir.async_create_issue(hass, DOMAIN, "restart_required", is_fixable=True, severity=ir.IssueSeverity.WARNING,
                          translation_key="restart_required", translation_placeholders={"version": "1"})
    await setup_with_release(hass, aioclient_mock, mock_entry)
    assert ir.async_get(hass).async_get_issue(DOMAIN, "restart_required") is None
