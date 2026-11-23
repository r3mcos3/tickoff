"""Pure date maths of recurrence rules."""

from datetime import date

import pytest
import voluptuous as vol

from custom_components.tickoff.recurrence import next_due, normalize

D = date


def rule(**kw):
    return normalize(kw, kw.pop("due", None), D(2026, 1, 1))


def test_daily_rolls_from_due_or_today():
    r = normalize({"type": "daily"}, D(2026, 3, 10), D(2026, 3, 10))
    assert next_due(r, D(2026, 3, 10), D(2026, 3, 10)) == D(2026, 3, 11)
    # three days late: does not pile up, goes to the day after today
    assert next_due(r, D(2026, 3, 7), D(2026, 3, 10)) == D(2026, 3, 11)
    # early: moves on from the due date
    assert next_due(r, D(2026, 3, 15), D(2026, 3, 10)) == D(2026, 3, 16)


def test_daily_interval_keeps_phase():
    r = normalize({"type": "daily", "interval": 3}, D(2026, 3, 1), D(2026, 3, 1))
    assert next_due(r, D(2026, 3, 1), D(2026, 3, 1)) == D(2026, 3, 4)
    assert next_due(r, D(2026, 3, 1), D(2026, 3, 5)) == D(2026, 3, 7)  # 1,4,7


def test_weekly_weekdays():
    r = normalize({"type": "weekly", "weekdays": [0, 3]}, D(2026, 3, 2), D(2026, 3, 2))  # Mon
    assert next_due(r, D(2026, 3, 2), D(2026, 3, 2)) == D(2026, 3, 5)  # Thu
    assert next_due(r, D(2026, 3, 5), D(2026, 3, 5)) == D(2026, 3, 9)  # next Mon
    # completed late on Saturday: next is Monday
    assert next_due(r, D(2026, 3, 5), D(2026, 3, 7)) == D(2026, 3, 9)


def test_weekly_defaults_to_weekday_of_due_and_interval():
    r = normalize({"type": "weekly", "interval": 2}, D(2026, 3, 2), D(2026, 3, 2))
    assert r["weekdays"] == [0]
    assert next_due(r, D(2026, 3, 2), D(2026, 3, 2)) == D(2026, 3, 16)


def test_monthly_end_of_month_does_not_drift():
    r = normalize({"type": "monthly"}, D(2026, 1, 31), D(2026, 1, 31))
    assert r["day"] == 31
    feb = next_due(r, D(2026, 1, 31), D(2026, 1, 31))
    assert feb == D(2026, 2, 28)
    assert next_due(r, feb, feb) == D(2026, 3, 31)  # back to the 31st


def test_monthly_late_and_early():
    r = normalize({"type": "monthly"}, D(2026, 3, 1), D(2026, 3, 1))
    assert next_due(r, D(2026, 3, 1), D(2026, 3, 10)) == D(2026, 4, 1)  # paid on the 10th
    r15 = normalize({"type": "monthly"}, D(2026, 3, 15), D(2026, 3, 5))
    assert next_due(r15, D(2026, 3, 15), D(2026, 3, 5)) == D(2026, 4, 15)  # done early


def test_monthly_interval_and_year_rollover():
    r = normalize({"type": "monthly", "interval": 3}, D(2026, 11, 20), D(2026, 11, 20))
    assert next_due(r, D(2026, 11, 20), D(2026, 11, 20)) == D(2027, 2, 20)


def test_yearly_leap_day():
    r = normalize({"type": "yearly"}, D(2028, 2, 29), D(2028, 2, 29))
    assert next_due(r, D(2028, 2, 29), D(2028, 2, 29)) == D(2029, 2, 28)
    assert next_due(r, D(2029, 2, 28), D(2029, 2, 28)) == D(2030, 2, 28)


def test_after_completion_counts_from_today():
    r = normalize({"type": "after_completion", "days": 10}, D(2026, 3, 1), D(2026, 3, 20))
    assert next_due(r, D(2026, 3, 1), D(2026, 3, 20)) == D(2026, 3, 30)
    assert next_due(r, None, D(2026, 3, 20)) == D(2026, 3, 30)


def test_no_due_date_uses_today_as_anchor():
    r = normalize({"type": "weekly", "weekdays": [4]}, None, D(2026, 3, 2))
    assert next_due(r, None, D(2026, 3, 2)) == D(2026, 3, 6)


def test_validation():
    assert normalize(None, None, D(2026, 1, 1)) is None
    for bad in ({"type": "hourly"}, {"type": "weekly", "weekdays": [9]}, {"type": "daily", "interval": 0}):
        with pytest.raises(vol.Invalid):
            normalize(bad, None, D(2026, 1, 1))
