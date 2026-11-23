# Tickoff

**Tickoff: tasks for Home Assistant.**

Tickoff keeps your to-dos in Home Assistant itself: no cloud, no extra account, no dependency on any other app.
Every list is a standard `todo` entity (works with the Companion app, Assist and every to-do card), and tags,
priorities and events are available for your automations.

> **Status: early development (v0.2.0).** Lists, tasks, priority, global coloured tags, services and events work.
> Recurring tasks, subtasks, snooze, due-date notifications and a dedicated dashboard card are on the roadmap below.

## Features

| | |
|---|---|
| ✅ Lists | One config entry per list → `todo.tickoff_<list>` (friendly name is the plain list name) |
| ✅ Tasks | Title, notes, due date with optional time, done/open, manual order |
| ✅ Priority | None / low / medium / high |
| ✅ Tags | **Global** register with colours, shared by all lists; rename or delete once, applied everywhere |
| ✅ Services | `add_task`, `update_task`, `complete_task`, `reopen_task`, `delete_task`, `get_tasks`, `set_tag`, `rename_tag`, `delete_tag`, `get_tags` |
| ✅ Events | `tickoff_task_created`, `tickoff_task_completed`, `tickoff_task_reopened` |
| ✅ Notify service | Choose a `notify.*` service per list (stored; sending arrives with the notification milestone) |
| 🔜 Subtasks, snooze to tomorrow, bulk-delete completed | M3 |
| 🔜 Recurring tasks (daily, weekly on weekdays, monthly, yearly, N days after completion) | M4 |
| 🔜 Open / today / overdue sensors, de-duplicated due-date notification (08:00 or at the set time) | M5 |
| 🔜 Dedicated Lovelace card (tags, priority, subtasks, drag & drop, today view) | M6 |

See [`docs/ontwerp.md`](docs/ontwerp.md) for the design and milestones and
[`docs/vergelijking.md`](docs/vergelijking.md) for how Tickoff relates to Home Tasks, Better ToDo and Chore Calendar.

## Installation

Requires Home Assistant **2026.11** or newer.

### Home Assistant Marketplace

[![Open your Home Assistant instance and open a repository inside the Marketplace.](https://my.home-assistant.io/badges/marketplace_repository.svg)](https://my.home-assistant.io/redirect/marketplace_repository/?owner=r3mcos3&repository=tickoff&category=integration)

1. Click the button, or open **Settings → Marketplace** and search for **Tickoff**.
2. Download Tickoff and restart Home Assistant.

### HACS (custom repository)

1. HACS → ⋮ → **Custom repositories** → add `https://github.com/r3mcos3/tickoff` as category **Integration**.
2. Download Tickoff and restart Home Assistant.

### Manual

Copy `custom_components/tickoff/` into your `config/custom_components/` folder and restart.

## Setup

**Settings → Devices & services → Add integration → Tickoff**. Give the list a name (for example `Groceries`);
optionally pick the notify service that should receive due-date notifications. Repeat for every list.
The notify service can be changed later under the integration's **Configure** button.

The list `Groceries` becomes `todo.tickoff_groceries`.

## Services

Task services target one or more Tickoff `todo` entities. Tag services are global.

```yaml
action: tickoff.add_task
target:
  entity_id: todo.tickoff_groceries
data:
  title: Mow the lawn
  notes: Front and back
  due_date: "2026-12-01"
  due_time: "09:00:00"
  priority: 3          # 0 none, 1 low, 2 medium, 3 high
  tags: [garden, weekend]
response_variable: result   # result["todo.tickoff_groceries"]["task"]["id"]
```

| Service | Purpose |
|---|---|
| `tickoff.add_task` | Add a task (returns it, including its `id`) |
| `tickoff.update_task` | Change fields by `task_id`; omitted fields stay, `null` clears notes/due |
| `tickoff.complete_task` / `reopen_task` / `delete_task` | By `task_id` |
| `tickoff.get_tasks` | Return tasks, optional `status` (`open`/`done`) and `tag` filter |
| `tickoff.set_tag` | Create a tag or set its colour (`#rrggbb`) |
| `tickoff.rename_tag` / `delete_tag` | Applies to every task in every list |
| `tickoff.get_tags` | Return all tags with their colours |

## Events

| Event | When |
|---|---|
| `tickoff_task_created` | A task was added (by any route, including the standard todo card) |
| `tickoff_task_completed` | A task was ticked off |
| `tickoff_task_reopened` | A done task was set open again |

Event data: `entry_id`, `list_name`, `task_id`, `title`, `due_date`, `due_time`, `priority`, `tags`.

## Data

Tasks are stored in `.storage/tickoff.<entry_id>` and the tags in `.storage/tickoff.tags`, so both are included in
normal Home Assistant backups. Removing a list deletes its tasks; tags stay in the global register.

## Development

```bash
uv venv --python 3.14 .venv
uv pip install --python .venv/bin/python pytest-homeassistant-custom-component ruff
.venv/bin/python -m pytest -q
.venv/bin/ruff check .
```

## License

To be decided by the maintainer before the first public release.
