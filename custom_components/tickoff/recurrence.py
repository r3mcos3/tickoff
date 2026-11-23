"""Recurrence rules: pure date maths, no Home Assistant imports."""

from __future__ import annotations

import calendar
from datetime import date, timedelta
from typing import Any

import voluptuous as vol

REC_DAILY = "daily"
REC_WEEKLY = "weekly"
REC_MONTHLY = "monthly"
REC_YEARLY = "yearly"
REC_AFTER_COMPLETION = "after_completion"
REC_TYPES = (REC_DAILY, REC_WEEKLY, REC_MONTHLY, REC_YEARLY, REC_AFTER_COMPLETION)

RECURRENCE_SCHEMA = vol.Schema(
    {
        vol.Required("type"): vol.In(REC_TYPES),
        vol.Optional("interval", default=1): vol.All(vol.Coerce(int), vol.Range(min=1, max=365)),
        # weekly: weekdays, 0 = Monday
        vol.Optional("weekdays"): vol.All(
            [vol.All(vol.Coerce(int), vol.Range(min=0, max=6))], vol.Length(min=1, max=7)
        ),
        # after_completion: number of days after ticking off
        vol.Optional("days"): vol.All(vol.Coerce(int), vol.Range(min=1, max=3650)),
        # monthly / yearly anchors (filled in automatically from the due date)
        vol.Optional("day"): vol.All(vol.Coerce(int), vol.Range(min=1, max=31)),
        vol.Optional("month"): vol.All(vol.Coerce(int), vol.Range(min=1, max=12)),
    },
    extra=vol.PREVENT_EXTRA,
)


def normalize(rule: dict[str, Any] | None, due: date | None, today: date) -> dict[str, Any] | None:
    """Validate a rule and fill in anchors; None clears the recurrence."""
    if not rule:
        return None
    rule = dict(RECURRENCE_SCHEMA(rule))
    anchor = due or today
    kind = rule["type"]
    if kind == REC_WEEKLY:
        rule.setdefault("weekdays", [anchor.weekday()])
        rule["weekdays"] = sorted(set(rule["weekdays"]))
    elif kind == REC_MONTHLY:
        rule.setdefault("day", anchor.day)
    elif kind == REC_YEARLY:
        rule.setdefault("day", anchor.day)
        rule.setdefault("month", anchor.month)
    elif kind == REC_AFTER_COMPLETION:
        rule.setdefault("days", 1)
    # keep only the keys that belong to the type
    keep = {
        REC_DAILY: {"type", "interval"},
        REC_WEEKLY: {"type", "interval", "weekdays"},
        REC_MONTHLY: {"type", "interval", "day"},
        REC_YEARLY: {"type", "interval", "day", "month"},
        REC_AFTER_COMPLETION: {"type", "days"},
    }[kind]
    return {k: v for k, v in rule.items() if k in keep}


def _clip(year: int, month: int, day: int) -> date:
    return date(year, month, min(day, calendar.monthrange(year, month)[1]))


def _add_months(year: int, month: int, delta: int) -> tuple[int, int]:
    index = year * 12 + (month - 1) + delta
    return index // 12, index % 12 + 1


def next_due(rule: dict[str, Any], due: date | None, today: date) -> date:
    """Next due date after ticking off.

    Fixed schedules (daily/weekly/monthly/yearly) return the first occurrence strictly after
    max(due, today): ticking off late does not pile up missed occurrences and ticking off early
    still moves on to the next one. "after_completion" counts from today.
    """
    kind = rule["type"]
    if kind == REC_AFTER_COMPLETION:
        return today + timedelta(days=rule["days"])

    interval = rule.get("interval", 1)
    base = max(due, today) if due else today
    anchor = due or today

    if kind == REC_DAILY:
        # keep the phase of the original due date when interval > 1
        steps = (base - anchor).days // interval + 1
        return anchor + timedelta(days=steps * interval)

    if kind == REC_WEEKLY:
        weekdays = rule["weekdays"]
        anchor_week = anchor - timedelta(days=anchor.weekday())
        candidate = base + timedelta(days=1)
        for _ in range(7 * interval * 2 + 7):
            weeks = ((candidate - timedelta(days=candidate.weekday())) - anchor_week).days // 7
            if candidate.weekday() in weekdays and weeks % interval == 0:
                return candidate
            candidate += timedelta(days=1)
        raise ValueError("no next weekly occurrence found")  # pragma: no cover

    if kind == REC_MONTHLY:
        day = rule["day"]
        year, month = anchor.year, anchor.month
        for step in range(5000):
            y, m = _add_months(year, month, step * interval)
            candidate = _clip(y, m, day)
            if candidate > base:
                return candidate
        raise ValueError("no next monthly occurrence found")  # pragma: no cover

    # yearly
    for step in range(500):
        candidate = _clip(anchor.year + step * interval, rule["month"], rule["day"])
        if candidate > base:
            return candidate
    raise ValueError("no next yearly occurrence found")  # pragma: no cover
