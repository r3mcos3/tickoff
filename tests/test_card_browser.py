"""Run the dashboard card in a real headless Chromium/Chrome against a mocked hass object.

Skipped when no Chromium/Chrome binary is installed. CI (ubuntu) has Google Chrome.
"""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

HARNESS = Path(__file__).parent / "frontend" / "harness.html"
BROWSER = next(
    (b for n in ("chromium", "google-chrome", "google-chrome-stable", "chromium-browser") if (b := shutil.which(n))),
    None,
)

pytestmark = pytest.mark.skipif(BROWSER is None, reason="no Chromium/Chrome available")


@pytest.fixture(scope="module")
def results() -> dict:
    proc = subprocess.run(
        [BROWSER, "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
         "--allow-file-access-from-files", "--virtual-time-budget=5000", "--dump-dom", HARNESS.as_uri()],
        capture_output=True, text=True, timeout=90, check=False,
    )
    dom = proc.stdout
    marker = '<pre id="out">'
    assert marker in dom, proc.stderr[-2000:]
    raw = dom.split(marker, 1)[1].split("</pre>", 1)[0]
    raw = raw.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"')
    return json.loads(raw)


def test_no_script_error(results):
    assert "error" not in results, results.get("error")


EXPECTED_TRUE = [
    "loading_before_data", "subscribed", "title_is_list_name", "open_count", "xss_escaped", "done_last_and_struck",
    "done_section_label", "chip_colored", "overdue_class", "today_time_24h", "recurrence_shown", "subtask_progress",
    "priority_dot", "filter_garden", "filter_cleared", "complete_call", "reopen_call", "snooze_call",
    "delete_first_click_no_call", "delete_second_click_calls", "detail_notes", "detail_history", "subtask_call",
    "add_subtask_call", "editor_open", "update_call", "editor_closed", "add_call", "add_form_cleared",
    "blank_title_ignored", "draggable", "drag_up", "drag_down", "drop_target_math", "clear_call", "tag_color_call",
    "live_update", "all_lists_rows", "list_picker_visible", "today_title", "today_no_add_form", "today_no_drag",
    "today_shows_list_name", "ro_no_actions", "ro_checkbox_disabled", "ro_no_calls", "hidden_when_empty",
    "show_completed_false", "compact_class", "dutch", "stub", "editor_form", "editor_selector", "editor_event",
    "registered", "unsubscribed",
]


@pytest.mark.parametrize("key", EXPECTED_TRUE)
def test_card_behaviour(results, key):
    assert results.get(key) is True, f"{key}={results.get(key)!r}"


def test_row_order_and_today_view(results):
    assert results["rows"][0].startswith("Mow")  # open tasks in manual order, done last
    assert results["rows"][-1] == "Old task"
    # today view: overdue first, then today sorted by time then priority
    assert results["today_titles"][0].startswith("Mow")
    assert "Vacuum" in results["today_titles"] and "Buy milk" in results["today_titles"]
    assert "Call plumber" not in results["today_titles"]
