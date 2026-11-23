"""Constants for tickoff."""

from __future__ import annotations

from typing import Final

DOMAIN: Final = "tickoff"

CONF_LIST_NAME: Final = "name"

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
TASK_POSITION: Final = "position"
TASK_CREATED_AT: Final = "created_at"
TASK_UPDATED_AT: Final = "updated_at"

STATUS_OPEN: Final = "open"
STATUS_DONE: Final = "done"
