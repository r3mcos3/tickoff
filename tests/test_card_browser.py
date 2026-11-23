"""Run the dashboard card in a real headless Chromium/Chrome against a mocked hass object.

Skipped when no Chromium/Chrome binary is installed. CI (ubuntu) has Google Chrome.
"""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

FRONTEND = Path(__file__).parent / "frontend"
HARNESS = FRONTEND / "harness.html"
BROWSER = next(
    (b for n in ("chromium", "google-chrome", "google-chrome-stable", "chromium-browser") if (b := shutil.which(n))),
    None,
)

pytestmark = pytest.mark.skipif(BROWSER is None, reason="no Chromium/Chrome available")


def run_harness(page: Path) -> dict:
    proc = subprocess.run(
        [BROWSER, "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
         "--allow-file-access-from-files", "--virtual-time-budget=5000", "--dump-dom", page.as_uri()],
        capture_output=True, text=True, timeout=90, check=False,
    )
    dom = proc.stdout
    marker = '<pre id="out">'
    assert marker in dom, proc.stderr[-2000:]
    raw = dom.split(marker, 1)[1].split("</pre>", 1)[0]
    raw = raw.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"')
    return json.loads(raw)


@pytest.fixture(scope="module")
def results() -> dict:
    return run_harness(HARNESS)


def test_no_script_error(results):
    assert "error" not in results, results.get("error")


EXPECTED_TRUE = [
    "loading_before_data",
    "subscribed",
    "section_names",
    "title_all",
    "pills",
    "sorted_upcoming",
    "done_collapsed",
    "xss_escaped",
    "overdue_chip",
    "today_chip_24h",
    "tomorrow_label",
    "recurrence_shown",
    "subtask_bar",
    "tag_chip_colored",
    "priority_ring",
    "filter_chips",
    "done_expands",
    "done_collapses",
    "filter_garden",
    "filter_cleared",
    "complete_call",
    "snooze_call",
    "delete_asks",
    "delete_confirmed",
    "detail_notes",
    "detail_history",
    "subtask_call",
    "subtask_untick",
    "add_subtask_call",
    "remove_subtask_call",
    "sheet_open",
    "sheet_prefilled",
    "quick_date",
    "prio_seg",
    "update_call",
    "sheet_closed",
    "clear_date",
    "cancel_closes",
    "backdrop_closes",
    "escape_closes",
    "sheet_delete_asks",
    "sheet_delete",
    "no_native_pickers_visible",
    "date_placeholder",
    "date_mask",
    "time_mask",
    "invalid_time_blocks_save",
    "invalid_date_blocks_save",
    "lenient_input_saved",
    "picker_fills_text",
    "fmt_helpers",
    "far_date_format",
    "no_am_pm",
    "time_24h_even_with_12h_profile",
    "new_button",
    "no_inline_adder",
    "new_modal_open",
    "new_title_hint",
    "save_button_label",
    "preview",
    "draft_subtasks_listed",
    "draft_subtask_edit_remove",
    "modal_survives_push",
    "add_call",
    "add_call_subtasks",
    "modal_closes_after_add",
    "add_fields_override",
    "enter_saves_and_closes",
    "add_recurrence_form",
    "blank_title_blocked",
    "invalid_date_blocked",
    "cancel_discards",
    "escape_closes_new",
    "backdrop_closes_new",
    "draft_cleared_between_openings",
    "edit_subtasks_listed",
    "edit_sub_toggle",
    "edit_sub_add",
    "edit_sub_rename",
    "edit_sub_blank_removes",
    "edit_sub_remove",
    "edit_sub_refreshed",
    "edit_sub_not_rebuilt_while_typing",
    "edit_sub_catches_up",
    "save_adds_pending_subtask",
    "vanished_task_closes_modal",
    "parse_basic",
    "parse_dutch",
    "parse_weekday",
    "parse_relative",
    "parse_iso_time",
    "parse_time_only_means_today",
    "parse_recurrence",
    "parse_dutch_recurrence",
    "parse_priority_forms",
    "parse_tags_dedupe",
    "parse_only_keywords_keeps_text",
    "parse_dd_mm",
    "parse_bad_time",
    "parse_exclamation_in_text",
    "manual_flat",
    "draggable_in_manual",
    "drag_up",
    "drag_down",
    "drop_target_math",
    "manual_off",
    "clear_call",
    "tag_color_call",
    "live_update",
    "today_sections",
    "today_rows",
    "today_title",
    "upcoming_by_day",
    "done_view",
    "custom_title",
    "empty_state",
    "not_hidden_with_tasks",
    "hidden_when_empty",
    "config_tags",
    "show_completed_false",
    "compact_class",
    "show_add_false_hides_button",
    "ro_no_actions",
    "ro_check_disabled",
    "ro_no_calls",
    "dutch",
    "not_set_up",
    "editor_form",
    "editor_views",
    "editor_event",
    "registered",
    "stub",
    "unsubscribed",
]


@pytest.mark.parametrize("key", EXPECTED_TRUE)
def test_card_behaviour(results, key):
    assert results.get(key) is True, f"{key}={results.get(key)!r}"


def test_section_and_row_order(results):
    assert results["rows"][0].startswith("Mow")  # overdue first
    assert results["rows"][1] == "Buy milk"  # then today
    assert results["rows"][-1] == "Sort garage"  # no date last, completed section is collapsed


PANEL_EXPECTED_TRUE = [
    "nav_everything",
    "no_lists_anywhere",
    "overdue_badge",
    "today_active",
    "today_card",
    "upcoming_card",
    "all_card",
    "done_card",
    "tag_card",
    "card_instance_kept",
    "tag_rows",
    "tag_color",
    "tag_rename",
    "tag_delete_asks",
    "tag_delete",
    "tag_add",
    "targets_listed",
    "telegram_first",
    "telegram_label_clean",
    "telegram_checked",
    "kinds",
    "time_value",
    "test_enabled",
    "target_toggle_on",
    "settings_ws",
    "values_persist_after_save",
    "saved_flash",
    "time_mask",
    "invalid_time_not_saved",
    "server_push_keeps_values",
    "test_disabled_when_none",
    "test_flow",
    "test_flash",
    "update_available_shown",
    "update_release_link",
    "settings_nav_dot",
    "install_calls_update_service",
    "restart_needed_shown",
    "up_to_date_shown",
    "no_targets_hint",
    "user_settings_readonly",
    "user_cannot_install",
    "narrow_hidden",
    "narrow_open",
    "narrow_closes",
    "menu_toggles_sidebar",
    "dutch",
    "unsubscribed",
]


@pytest.fixture(scope="module")
def panel_results() -> dict:
    return run_harness(FRONTEND / "panel.html")


def test_panel_no_script_error(panel_results):
    assert "error" not in panel_results, panel_results.get("error")


@pytest.mark.parametrize("key", PANEL_EXPECTED_TRUE)
def test_panel_behaviour(panel_results, key):
    assert panel_results.get(key) is True, f"{key}={panel_results.get(key)!r}"
