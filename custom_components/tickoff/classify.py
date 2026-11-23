"""Open / today / overdue classification (one definition, used by sensors, card, notifier)."""

from __future__ import annotations

from datetime import date, datetime, time
from typing import Any

from homeassistant.util import dt as dt_util

from .const import STATUS_OPEN, TASK_DUE_DATE, TASK_DUE_TIME, TASK_STATUS

OVERDUE = "overdue"
TODAY = "today"
UPCOMING = "upcoming"
NO_DATE = "no_date"


def due_moment(task: dict[str, Any], default_time: time | None = None) -> datetime | None:
    """The moment a task is due: date + time, or end of day (23:59:59) when it has no time."""
    if not task[TASK_DUE_DATE]:
        return None
    day = date.fromisoformat(task[TASK_DUE_DATE])
    if task[TASK_DUE_TIME]:
        at = time.fromisoformat(task[TASK_DUE_TIME])
    else:
        at = default_time or time(23, 59, 59)
    return datetime.combine(day, at, tzinfo=dt_util.get_default_time_zone())


def classify(task: dict[str, Any], now: datetime) -> str | None:
    """None for done tasks. overdue and today are mutually exclusive.

    - overdue: due date before today, or due today with a time that has passed
    - today: due today and not (yet) overdue
    """
    if task[TASK_STATUS] != STATUS_OPEN:
        return None
    if not task[TASK_DUE_DATE]:
        return NO_DATE
    now = dt_util.as_local(now)
    day = date.fromisoformat(task[TASK_DUE_DATE])
    if day < now.date():
        return OVERDUE
    if day == now.date():
        if task[TASK_DUE_TIME] and due_moment(task) <= now:  # type: ignore[operator]
            return OVERDUE
        return TODAY
    return UPCOMING
