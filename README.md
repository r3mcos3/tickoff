# Tickoff

**Tickoff: tasks for Home Assistant.**

[![CI](https://github.com/r3mcos3/tickoff/actions/workflows/ci.yaml/badge.svg)](https://github.com/r3mcos3/tickoff/actions/workflows/ci.yaml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

One place for all your tasks, inside Home Assistant: no cloud, no account, no other app. Tickoff adds a **Tickoff
item to the sidebar** (today, upcoming, all, completed, per tag), a **dashboard card**, a standard `todo` entity
(works in the Companion app and with Assist), count sensors, and **due-date notifications to Telegram or your phone**.

> **Status: early release (v0.4.5).** Automated tests cover the backend and the UI (see below), but Tickoff has not
> been used for long in a real Home Assistant yet. Back up before you try it and please report problems.

## What it does

- **Just tasks, no lists.** One collection; organise with tags and smart views.
- **New task in a modal**: the **+ New task** button opens a window with everything in one place: title, notes, **subtasks**,
  due date and time, priority, tags and repeat. The title understands quick-add words: type `Call mom tomorrow 14:30 #family !high` and Tickoff understands the date, time, tag and priority
  (also Dutch: `morgen`, `vrijdag`, `over 3 dagen`, `!hoog`, `elke week`, or a date such as `15-03`). A preview shows what it understood; anything you fill in yourself wins over the words in the title.
- **Smart views**: Today (overdue + today), Upcoming (per day), All tasks (grouped: overdue, today, upcoming, no date,
  completed), Completed, and one view per tag. Optional manual order with drag & drop.
- **Tasks**: title, notes, due date with optional time, priority, tags with colours (one global register), snooze to
  tomorrow, history.
- **Subtasks**: add them while creating a task or later in the edit window (add, rename, tick, remove), with a progress bar
  in the list. Ticking the last subtask completes the task; recurring tasks reset their subtasks.
- **Recurring tasks** with rollover when you tick them off: daily, weekly (chosen weekdays), monthly, yearly, or
  *N days after completing*. Late ticking never creates a backlog and monthly tasks don't drift (31st → 28th → 31st).
- **Notifications** on the due date, **once per task**, also across restarts: choose one or more targets (**Telegram**,
  mobile app, any notify service or entity), a test button included.
- **Sensors**: `sensor.tickoff_open`, `sensor.tickoff_today`, `sensor.tickoff_overdue`, plus events and services for automations.
- English and Dutch. Times are always 24-hour (`hh:mm`) and dates `dd-mm-yyyy`, whatever your browser's language is.

## Installation

Requires Home Assistant **2026.11** or newer.

### Home Assistant Marketplace

[![Open your Home Assistant instance and open a repository inside the Marketplace.](https://my.home-assistant.io/badges/marketplace_repository.svg)](https://my.home-assistant.io/redirect/marketplace_repository/?owner=r3mcos3&repository=tickoff&category=integration)

Click the button, or open **Settings → Marketplace** and search for **Tickoff**, download it and restart Home Assistant.

### HACS (custom repository)

1. HACS → ⋮ → **Custom repositories** → add `https://github.com/r3mcos3/tickoff`, category **Integration**.
2. Download Tickoff and restart Home Assistant.

### Manual

Copy `custom_components/tickoff/` into `config/custom_components/` and restart.

## Setup

**Settings → Devices & services → Add integration → Tickoff.** There is nothing to configure: optionally pick where
notifications go. A **Tickoff** item appears in the sidebar. (You can hide it per user in your profile.)

### Upgrading from 0.1 / 0.2 (lists)

Older versions had separate lists. On the first start of this version all lists are **merged into one collection**
(order kept, tags kept) and the entities become `todo.tickoff` and `sensor.tickoff_open` / `_today` / `_overdue`.
The old per-list entity ids disappear, so update automations and dashboards that used them. The old notify service
settings are carried over as notification targets. Make a backup first.

## The sidebar panel

| | |
|---|---|
| **Today / Upcoming / All tasks / Completed** | The task views, with quick add, tag filter, edit sheet and bulk clear |
| **Tags** (in the menu) | One view per tag; **Manage tags** changes colour, renames, deletes (applies to every task) |
| **Settings** | Where notifications go (Telegram, phone, ...), the notification time and a test button |

The panel always opens on **All tasks**. On a phone, the ☰ button at the top left is Home Assistant's own menu (your way back to the rest of Home Assistant) and the list button at the top right opens Tickoff's views. Everyone can work with tasks; only administrators change the settings.

## Notifications (Telegram and more)

Open **Tickoff → Settings → Notifications** and tick where messages should go. You can pick several targets.

- **Telegram**: set up the *Telegram bot* integration in Home Assistant. Its notify entity then shows up in the list
  with a **Telegram** badge. (Tickoff sends through `notify.send_message`, which is how Home Assistant addresses
  notify entities.)
- **Mobile app and other services**: every `notify.<name>` service (for example `notify.mobile_app_my_phone`) is listed.
- Tasks **with a time** notify at that time. Tasks **with a date only** notify at the *notification time* (default 08:00).
- Each task notifies once per due date. A task you add or snooze for *today* after the notification time does not
  notify immediately. A recurring task notifies again at its next due date.
- **Send test message** saves your choice and sends one test message to the chosen targets.

You can also choose targets in the integration's **Configure** button. For custom handling, listen for the
`tickoff_task_due` event (or use the blueprint below).

## Updating from Home Assistant

Tickoff has an **update entity** (`update.tickoff_update`), so new versions show up under **Settings → System → Updates**,
on the integration page and in **Tickoff → Settings → Updates**.

- It checks the GitHub releases of this repository every 6 hours (no account needed; if GitHub is unreachable
  Tickoff keeps working and simply shows no update).
- **Install** downloads the release from `github.com/r3mcos3/tickoff` (only that repository), checks it (it must be
  the Tickoff integration with exactly the announced version, no unsafe paths, size limits) and only then replaces
  the files in `custom_components/tickoff`. The previous version is kept in `.storage/tickoff_backup/<version>` for a
  manual rollback; a failed swap is rolled back automatically.
- After installing, a **repair** asks you to restart Home Assistant (one click); the new version runs after the restart.
- **Installed through the Marketplace or HACS?** Home Assistant 2026.11's built-in Marketplace and HACS both create their
  own update entity for Tickoff (for example `update.tickoff`) next to Tickoff's own (`update.tickoff_update`). You never
  need two installs: Tickoff's entity mirrors the package manager's versions, its **Install** hands the job to the
  Marketplace/HACS (you get one restart notice), and installing in the Marketplace/HACS updates Tickoff's entity too.
  Without a package manager, Tickoff installs the update itself.
- The archive is fetched over HTTPS from GitHub; GitHub offers no checksum for source archives, so that is the
  trust anchor.

## Dashboard card

The card is loaded by the integration itself, no resource to add. Pick **Tickoff** in the card picker or use YAML:

```yaml
type: custom:tickoff-card
view: today        # all | today | upcoming | done
```

```yaml
type: custom:tickoff-card
view: all
tags: [garden]     # only tasks with this tag
compact: true
```

| Option | Default | |
|---|---|---|
| `view` | `all` | `all`, `today`, `upcoming` or `done` |
| `title` | by view | Card title |
| `tags` | all | Only tasks with one of these tags |
| `show_completed` | `true` | Completed section in `all` |
| `show_add` | `true` | The **+ New task** button |
| `manual` | `false` | Manual order with drag & drop (also a button in the card header) |
| `read_only` | `false` | No editing, ticking or deleting |
| `compact` | `false` | Tighter rows |
| `hide_when_empty` | `false` | Hide the card when there is nothing to show |

In the card: tick a task, tap it for notes, subtasks and history, ⏰ snooze, ✎ edit window (subtasks, due date shortcuts,
priority, tags, recurrence), 🗑 delete (second tap confirms), tap a tag chip to filter, 🎨 for tag colours. Times follow
your 12/24-hour profile setting.

## Entities

| Entity | What |
|---|---|
| `todo.tickoff` | All tasks: title, notes, due date/time, status, order. Ticking a recurring task rolls it over |
| `sensor.tickoff_open` / `_today` / `_overdue` | Counts. `_today` and `_overdue` list the tasks in the `tasks` attribute |

**overdue** = the due moment has passed (earlier date, or today with a time that has passed; a date without a time
is overdue the next day). **today** = due today and not yet overdue. They never overlap.

## Services

Task services target `todo.tickoff`; tag services are global.

```yaml
action: tickoff.add_task
target:
  entity_id: todo.tickoff
data:
  title: Pay the bill
  due_date: "2026-12-01"
  priority: 3                      # 0 none, 1 low, 2 medium, 3 high
  tags: [money]
  recurrence: {type: monthly}
  subtasks: [Check the amount]
response_variable: result          # result["todo.tickoff"]["task"]["id"]
```

| Service | Purpose |
|---|---|
| `add_task` | Add a task; returns it including its `id` |
| `update_task` | Change fields by `task_id`. Omitted fields stay, `null` clears notes, due date/time and recurrence |
| `complete_task`, `reopen_task`, `delete_task` | By `task_id`. Completing a recurring task rolls it over |
| `snooze_task` | Due date → tomorrow (time kept) |
| `move_task` | `task_id` after `previous_task_id` (omit it to move to the top) |
| `delete_completed` | Remove all done tasks; returns the count |
| `add_subtask`, `update_subtask`, `remove_subtask` | Subtasks by `subtask_id` |
| `get_tasks` | Tasks with all fields; optional `status` (`open`/`done`) and `tag` filter |
| `set_tag`, `rename_tag`, `delete_tag`, `get_tags` | Global tag register (`color: "#rrggbb"`) |

```yaml
recurrence: {type: daily}                              # also: interval: 2
recurrence: {type: weekly, weekdays: [0, 3]}           # Monday and Thursday (0 = Monday)
recurrence: {type: monthly}                            # same day of the month, clipped to month end
recurrence: {type: yearly}
recurrence: {type: after_completion, days: 10}         # 10 days after you tick it off
```

## Events

| Event | When |
|---|---|
| `tickoff_task_created` | A task was added (any route, including the standard todo card) |
| `tickoff_task_completed` | A task was ticked off (`recurring: true` when it rolled over) |
| `tickoff_task_reopened` | A done task was set open again |
| `tickoff_task_snoozed` | A task was snoozed |
| `tickoff_task_due` | A task reached its due moment (once per task per due date) |

Data: `entry_id`, `task_id`, `title`, `due_date`, `due_time`, `priority`, `tags`.

## Blueprint

[![Import blueprint](https://my.home-assistant.io/badges/blueprint_import.svg)](https://my.home-assistant.io/redirect/blueprint_import/?blueprint_url=https%3A%2F%2Fgithub.com%2Fr3mcos3%2Ftickoff%2Fblob%2Fmain%2Fblueprints%2Fautomation%2Ftickoff%2Fdue_notification.yaml)

*Tickoff - notify when a task is due*: reacts to `tickoff_task_due` with an optional minimum-priority filter, for your own
message or target.

## Data and backups

`.storage/tickoff.<entry_id>` holds the tasks and `.storage/tickoff.tags` the tags; both are in normal Home Assistant backups.

## Testing and development

See [`docs/testen.md`](docs/testen.md) (Dutch) for the manual checklist and what has and has not been verified.

```bash
uv venv --python 3.14 .venv
uv pip install --python .venv/bin/python -r requirements_test.txt
.venv/bin/python -m pytest -q        # backend + UI (UI tests need Chrome/Chromium)
.venv/bin/ruff check .
```

`tests/frontend/visual.html` and `visual_panel.html` render the card and panel with sample data for screenshots.
Design notes: [`docs/ontwerp.md`](docs/ontwerp.md); comparison with other projects: [`docs/vergelijking.md`](docs/vergelijking.md).

## License

MIT, see [LICENSE](LICENSE).
