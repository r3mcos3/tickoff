"""Self-update from the GitHub releases of the Tickoff repository.

Only the fixed repository below is ever contacted. A downloaded release is checked (layout,
manifest domain and version, size, path safety) before a single file in the live integration is
touched, the previous version is kept as a backup, and a failed swap is rolled back.
"""

from __future__ import annotations

import io
import json
import logging
import re
import shutil
import zipfile
from pathlib import Path
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

REPO = "r3mcos3/tickoff"
API = f"https://api.github.com/repos/{REPO}"
LATEST_URL = f"{API}/releases/latest"
MAX_DOWNLOAD = 5 * 1024 * 1024
MAX_UNPACKED = 8 * 1024 * 1024
HEADERS = {"Accept": "application/vnd.github+json", "User-Agent": "ha-tickoff-updater"}
_PREFIX = re.compile(r"^[^/]+/custom_components/" + DOMAIN + r"/(.+)$")
_VERSION = re.compile(r"^\d+(\.\d+){1,3}$")


class UpdateError(HomeAssistantError):
    """The update was refused or failed; nothing in the live integration was changed."""


def integration_dir() -> Path:
    """Where the running integration lives (patched in tests)."""
    return Path(__file__).parent


def backup_root(hass: HomeAssistant) -> Path:
    """Previous versions are kept outside custom_components, so they are never loaded."""
    return Path(hass.config.path(".storage", "tickoff_backup"))


def staging_root(hass: HomeAssistant) -> Path:
    return Path(hass.config.path(".storage", "tickoff_staging"))


def installed_version() -> str:
    return json.loads((integration_dir() / "manifest.json").read_text())["version"]


async def async_fetch_latest(hass: HomeAssistant) -> dict[str, Any] | None:
    """The latest published release (no drafts or pre-releases), or None if there is none."""
    session = async_get_clientsession(hass)
    async with session.get(LATEST_URL, headers=HEADERS, timeout=20) as resp:
        if resp.status == 404:
            return None
        if resp.status != 200:
            raise UpdateError(f"GitHub answered HTTP {resp.status}")
        data = await resp.json()
    tag = str(data.get("tag_name", ""))
    version = tag[1:] if tag.startswith("v") else tag
    if not _VERSION.match(version):
        raise UpdateError(f"Unexpected release tag {tag!r}")
    return {
        "version": version,
        "url": data.get("html_url") or f"https://github.com/{REPO}/releases",
        "notes": data.get("body") or "",
        "published": data.get("published_at"),
    }


async def async_download(hass: HomeAssistant, version: str) -> bytes:
    """Download the source archive of a release tag (size limited)."""
    if not _VERSION.match(version):
        raise UpdateError(f"Invalid version {version!r}")
    session = async_get_clientsession(hass)
    url = f"{API}/zipball/v{version}"
    async with session.get(url, headers=HEADERS, timeout=60) as resp:
        if resp.status != 200:
            raise UpdateError(f"Download failed: HTTP {resp.status}")
        if (getattr(resp, "content_length", None) or 0) > MAX_DOWNLOAD:
            raise UpdateError("Download is unexpectedly large")
        data = bytearray()
        async for chunk in resp.content.iter_chunked(65536):
            data.extend(chunk)
            if len(data) > MAX_DOWNLOAD:
                raise UpdateError("Download is unexpectedly large")
    return bytes(data)


def extract_release(data: bytes, expected_version: str) -> dict[str, bytes]:
    """Validate the archive and return {relative path: bytes} of custom_components/tickoff."""
    try:
        archive = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile as err:
        raise UpdateError("The download is not a valid zip file") from err
    files: dict[str, bytes] = {}
    total = 0
    for info in archive.infolist():
        match = _PREFIX.match(info.filename)
        if info.is_dir() or not match:
            continue
        rel = match.group(1)
        parts = rel.split("/")
        if rel.startswith("/") or "\\" in rel or ".." in parts or any(p == "" for p in parts):
            raise UpdateError(f"Unsafe path in the archive: {info.filename!r}")
        total += info.file_size
        if total > MAX_UNPACKED:
            raise UpdateError("The archive unpacks to an unexpected size")
        files[rel] = archive.read(info)
    if "manifest.json" not in files or "__init__.py" not in files:
        raise UpdateError("The archive does not contain the Tickoff integration")
    try:
        manifest = json.loads(files["manifest.json"])
    except ValueError as err:
        raise UpdateError("The manifest in the archive is not valid") from err
    if manifest.get("domain") != DOMAIN:
        raise UpdateError("The archive is not the Tickoff integration")
    if manifest.get("version") != expected_version:
        raise UpdateError(
            f"The archive contains version {manifest.get('version')!r}, expected {expected_version!r}"
        )
    return files


def install_files(
    files: dict[str, bytes], target: Path, backup_dir: Path, staging_dir: Path, old_version: str
) -> None:
    """Swap the integration folder for the new files; roll back when anything fails."""
    for folder in (staging_dir,):
        shutil.rmtree(folder, ignore_errors=True)
    backup_dir.mkdir(parents=True, exist_ok=True)
    staging_dir.parent.mkdir(parents=True, exist_ok=True)
    new_dir = staging_dir / DOMAIN
    for rel, content in files.items():
        path = new_dir / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)

    saved = backup_dir / old_version
    shutil.rmtree(saved, ignore_errors=True)
    shutil.move(str(target), str(saved))
    try:
        shutil.move(str(new_dir), str(target))
    except Exception as err:
        shutil.rmtree(target, ignore_errors=True)
        shutil.move(str(saved), str(target))  # roll back
        raise UpdateError(f"Installing failed, the previous version was restored: {err}") from err
    finally:
        shutil.rmtree(staging_dir, ignore_errors=True)
    for old in sorted(backup_dir.iterdir()):  # keep only the most recent backup
        if old != saved:
            shutil.rmtree(old, ignore_errors=True)


async def async_install(hass: HomeAssistant, version: str) -> None:
    """Download, validate and install ``version``. Raises UpdateError and leaves things untouched on failure."""
    data = await async_download(hass, version)
    files = await hass.async_add_executor_job(extract_release, data, version)
    target = integration_dir()
    staging = staging_root(hass)
    old_version = installed_version()
    try:
        await hass.async_add_executor_job(
            install_files, files, target, backup_root(hass), staging, old_version
        )
    except UpdateError:
        raise
    except OSError as err:
        raise UpdateError(f"Could not write the new files: {err}") from err
    _LOGGER.info("Tickoff %s installed (previous version kept in %s); restart to use it", version, backup_root(hass))
