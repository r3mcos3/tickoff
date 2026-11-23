"""Constants for tickoff."""

from __future__ import annotations

from typing import Final

DOMAIN: Final = "tickoff"

CONF_LIST_NAME: Final = "name"
CONF_NOTIFY_SERVICE: Final = "notify_service"

TAGS_STORAGE_KEY: Final = f"{DOMAIN}_tags"

STORAGE_VERSION: Final = 1
STORAGE_KEY_PREFIX: Final = f"{DOMAIN}."
SAVE_DELAY: Final = 1.0

# Task fields
TASK_ID: Final = "id"
TASK_TITLE: Final = "title"
TASK_NOTES: Final = "notes"
TASK_DUE_DATE: Final = "due_date"
TASK_DUE_TIME: Final = "due_time"
TASK_STATUS: Final = "status"
TASK_COMPLETED_AT: Final = "completed_at"
TASK_PRIORITY: Final = "priority"
TASK_TAGS: Final = "tags"
TASK_POSITION: Final = "position"
TASK_CREATED_AT: Final = "created_at"
TASK_UPDATED_AT: Final = "updated_at"

STATUS_OPEN: Final = "open"
STATUS_DONE: Final = "done"

# Priorities (0 = none)
PRIORITY_NONE: Final = 0
PRIORITY_LOW: Final = 1
PRIORITY_MEDIUM: Final = 2
PRIORITY_HIGH: Final = 3
PRIORITY_NAMES: Final = {0: "none", 1: "low", 2: "medium", 3: "high"}

DEFAULT_TAG_COLOR: Final = "#9e9e9e"
TAG_COLOR_PALETTE: Final = (
    "#e53935", "#fb8c00", "#fdd835", "#43a047", "#00acc1", "#1e88e5", "#8e24aa", "#6d4c41",
)

# Events
EVENT_TASK_CREATED: Final = f"{DOMAIN}_task_created"
EVENT_TASK_COMPLETED: Final = f"{DOMAIN}_task_completed"
EVENT_TASK_REOPENED: Final = f"{DOMAIN}_task_reopened"
