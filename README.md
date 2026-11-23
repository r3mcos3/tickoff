# Tickoff

**Tickoff: tasks for Home Assistant.**

[![CI](https://github.com/r3mcos3/tickoff/actions/workflows/ci.yaml/badge.svg)](https://github.com/r3mcos3/tickoff/actions/workflows/ci.yaml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Tickoff keeps your to-dos in Home Assistant itself: no cloud, no account, no other app needed. Every list is a
standard `todo` entity (so it works in the Companion app, with Assist and in every to-do card), and on top of that
you get priorities, **global coloured tags**, subtasks, recurring tasks, snooze, count sensors, due-date
notifications and a dashboard card.

> **Status: early release (v0.2.0).** It is tested with automated tests (backend and card, see below) but has not yet
> been used for long in a real Home Assistant. Back up before you try it, and please report problems.

## Features

- **Lists**: one entry per list, `todo.tickoff_<list>`; the friendly name is just the list name.
- **Tasks**: title, notes, due date with optional time, priority (none/low/medium/high), manual order.
- **Tags**: one **global** register with colours, shared by all lists. Rename or delete a tag once, it changes everywhere
  (also in lists that are currently disabled).
- **Subtasks**: ticking the last subtask completes the task; un-ticking one reopens it.
- **Recurring tasks** with rollover when you tick them off: daily, weekly (on chosen weekdays), monthly, yearly,
  or *N days after completing*. Fixed schedules never pile up missed occurrences and don't drift
  (31st → 28th → 31st). Subtasks reset on rollover.
- **Snooze to tomorrow**, **delete completed**, **history** per task (created, completed, reopened, snoozed, with `completed_at`).
- **Sensors**: open / due today / overdue, per list and over all lists (the *Tickoff* overview).
- **Notifications**: a built-in notify-service option (per list or one global default) plus the `tickoff_task_due`
  event and a blueprint. Once per task per due date, also across restarts. 08:00 (configurable) for tasks without a
  time, otherwise at the set time.
- **Sidebar panel**: a *Tickoff* item in the Home Assistant menu where you do everything in one place (see below).
- **Dashboard card** (`custom:tickoff-card`): list view and today overview, tag chips with colour and filter,
  priority, subtasks, drag & drop ordering, snooze, edit, bulk-clear and a visual editor. Registered automatically.
- Languages: English and Dutch.

## Installation

Requires Home Assistant **2026.11** or newer.

### Home Assistant Marketplace

[![Open your Home Assistant instance and open a repository inside the Marketplace.](https://my.home-assistant.io/badges/marketplace_repository.svg)](https://my.home-assistant.io/redirect/marketplace_repository/?owner=r3mcos3&repository=tickoff&category=integration)

Click the button, or open **Settings → Marketplace** and search for **Tickoff**, download it and restart Home Assistant.

### HACS (custom repository)

1. HACS → ⋮ → **Custom repositories** → add `https://github.com/r3mcos3/tickoff`, category **Integration**.
2. Download Tickoff and restart Home Assistant.

### Manual

Copy `custom_components/tickoff/` into your `config/custom_components/` folder and restart.

## Configuration

**Settings → Devices & services → Add integration → Tickoff.** Give the list a name, e.g. `Groceries`, and optionally
pick a notify service. Repeat for each list.

The first list also creates an **overview entry** called *Tickoff*. Its **Configure** button sets:

| Option | Meaning |
|---|---|
| Notify service | Default for every list without its own service |
| Notification time | Time for tasks that have a date but no time (default 08:00) |

Each list's own **Configure** button sets that list's notify service (it overrides the default). Notify services are
entered without the domain, e.g. `mobile_app_my_phone`.

### Entities

| Entity | What |
|---|---|
| `todo.tickoff_<list>` | The list. Title, notes, due date/time, status, order. Ticking a recurring task rolls it over |
| `sensor.tickoff_<list>_open` / `_today` / `_overdue` | Counts for that list |
| `sensor.tickoff_open` / `_today` / `_overdue` | Counts over all lists. `_today` and `_overdue` list the tasks in the `tasks` attribute |

Definitions: **open** = not done. **overdue** = the due moment has passed (earlier date, or today with a time that
has passed; a date without a time is overdue the next day). **today** = due today and not yet overdue. Overdue and
today never overlap.

## Sidebar panel

After installing, **Tickoff** appears in the Home Assistant sidebar (for every user; you can hide it per user in your
profile). It is the one place for everything:

- **Today**: overdue and due-today tasks over all lists. **All tasks**: every list in one view.
- **Each list**: the full task view, plus (admins) rename, delete (second click confirms) and the notify service of that list.
- **New list**: create a list without going through Settings. Lists you create here are the same entries as in
  *Settings → Devices & services*.
- **Tags**: colour, rename, delete (with how many tasks use each tag) and create tags.
- **Settings**: default notify service and notification time.

Creating, renaming and deleting lists and changing settings needs an admin user; everybody can work with tasks.
Renaming a list changes its name and friendly name; the entity id (`todo.tickoff_<original name>`) stays the same so
your automations keep working.

## Dashboard card

The card is loaded by the integration itself, no resource to add. Add it from the card picker (*Tickoff*) or in YAML:

```yaml
type: custom:tickoff-card
entities:
  - todo.tickoff_groceries
```

```yaml
# today overview over all lists
type: custom:tickoff-card
view: today
title: Today
```

```yaml
type: custom:tickoff-card
entities: [todo.tickoff_chores, todo.tickoff_garden]
show_completed: false
compact: true
hide_when_empty: true
```

| Option | Default | |
|---|---|---|
| `entities` | all lists | Lists to show |
| `view` | `list` | `list` or `today` |
| `title` | list name | Card title |
| `show_completed` | `true` | Show completed tasks (struck through, at the bottom) |
| `show_add` | `true` | Show the add form |
| `read_only` | `false` | No editing, ticking or deleting |
| `compact` | `false` | Tighter rows |
| `hide_when_empty` | `false` | Hide the card when there is nothing to show |

In the card: tick tasks, tap a task for notes, subtasks and history, ⏰ snooze to tomorrow, ✎ edit (including
recurrence), 🗑 delete (second tap confirms), drag the handle to reorder, tap a tag chip to filter, 🎨 to change tag
colours. Times follow your 12/24-hour profile setting. If your dashboards are in YAML mode and the card does not show,
reload the browser once; the integration registers the card as an extra module.

## Services

Task services target one or more Tickoff `todo` entities; tag services are global.

```yaml
action: tickoff.add_task
target:
  entity_id: todo.tickoff_groceries
data:
  title: Pay the bill
  due_date: "2026-12-01"
  priority: 3                      # 0 none, 1 low, 2 medium, 3 high
  tags: [money]
  recurrence: {type: monthly}
  subtasks: [Check the amount]
response_variable: result          # result["todo.tickoff_groceries"]["task"]["id"]
```

| Service | Purpose |
|---|---|
| `add_task` | Add a task; returns it including its `id` |
| `update_task` | Change fields by `task_id`. Omitted fields stay, `null` clears notes, due date/time and recurrence |
| `complete_task`, `reopen_task`, `delete_task` | By `task_id`. Completing a recurring task rolls it over |
| `snooze_task` | Due date → tomorrow (time kept) |
| `move_task` | `task_id` after `previous_task_id` (omit it to move to the top) |
| `delete_completed` | Remove all done tasks of the list; returns the count |
| `add_subtask`, `update_subtask`, `remove_subtask` | Subtasks by `subtask_id` |
| `get_tasks` | Tasks with all fields; optional `status` (`open`/`done`) and `tag` filter |
| `set_tag`, `rename_tag`, `delete_tag`, `get_tags` | Global tag register (`color: "#rrggbb"`) |

Recurrence:

```yaml
recurrence: {type: daily}                              # also: interval: 2
recurrence: {type: weekly, weekdays: [0, 3]}           # Monday and Thursday (0 = Monday)
recurrence: {type: monthly}                            # same day of the month, clipped to month end
recurrence: {type: yearly}
recurrence: {type: after_completion, days: 10}         # 10 days after you tick it off
```

Fixed schedules go to the first occurrence after `max(due date, today)`: ticking off late does not create a backlog,
ticking off early still moves on to the next occurrence.

## Events

| Event | When |
|---|---|
| `tickoff_task_created` | A task was added (any route, including the standard todo card) |
| `tickoff_task_completed` | A task was ticked off (`recurring: true` when it rolled over) |
| `tickoff_task_reopened` | A done task was set open again |
| `tickoff_task_snoozed` | A task was snoozed |
| `tickoff_task_due` | A task reached its due moment (once per task per due date) |

Data: `entry_id`, `list_name`, `task_id`, `title`, `due_date`, `due_time`, `priority`, `tags`.

## Blueprint

[![Import blueprint](https://my.home-assistant.io/badges/blueprint_import.svg)](https://my.home-assistant.io/redirect/blueprint_import/?blueprint_url=https%3A%2F%2Fgithub.com%2Fr3mcos3%2Ftickoff%2Fblob%2Fmain%2Fblueprints%2Fautomation%2Ftickoff%2Fdue_notification.yaml)

*Tickoff - notify when a task is due*: reacts to `tickoff_task_due`, with optional list and minimum-priority filter.
Use it instead of (or next to) the built-in notify option when you want your own target or conditions.

## Data and backups

`.storage/tickoff.<entry_id>` holds the tasks of a list and `.storage/tickoff.tags` the tags, so both are in normal
Home Assistant backups. Removing a list deletes its tasks; tags stay in the global register.

## Testing and development

See [`docs/testen.md`](docs/testen.md) for the manual test checklist (Dutch) and what has and has not been verified.

```bash
uv venv --python 3.14 .venv
uv pip install --python .venv/bin/python -r requirements_test.txt
.venv/bin/python -m pytest -q        # backend + card (card tests need Chrome/Chromium)
.venv/bin/ruff check .
```

Design and comparison with other projects: [`docs/ontwerp.md`](docs/ontwerp.md), [`docs/vergelijking.md`](docs/vergelijking.md).

## License

MIT, see [LICENSE](LICENSE).
