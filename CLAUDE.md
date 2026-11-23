# CLAUDE.md

Werknaam: **ha-tasks** (domein `ha_tasks`). Standalone Home Assistant custom integration voor taken,
zonder enige afhankelijkheid van Keepr. Taken leven in HA zelf (HA `Store`).

## Werkafspraken
- Antwoord altijd in het **Nederlands**.
- Commits: **emoji-prefix + Engelse subject**, bv. `✨ Add todo platform`. **Geen** Co-Authored-By- of Claude-Session-trailers.
- Kleine, afgeronde commits. Draai de tests vóór elke commit.
- **Niets naar buiten zonder akkoord van Remco**: niet pushen, geen GitHub-repo aanmaken, niet releasen, niets installeren in de draaiende HA, geen berichten sturen.
- Lees `docs/ontwerp.md` (wat we bouwen, mijlpalen) en `docs/vergelijking.md` (waarom, concurrenten) voor je iets groots begint.

## HA-conventies
- Config flow (`config_flow.py`, `strings.json`, `translations/en.json` + `nl.json`), geen YAML-configuratie.
- Eén config entry per takenlijst (zo hoort het bij Local To-do, Home Tasks, Chore Calendar).
- Opslag: `homeassistant.helpers.storage.Store` per entry, versioned met migratiefunctie. Nooit blokkerende I/O in de event loop.
- `TodoListEntity` in `todo.py`; sensoren/binary_sensors in eigen platformbestanden; `DataUpdateCoordinator` alleen waar polling/aggregatie nuttig is (taken zelf zijn push: store-wijziging -> `async_write_ha_state`).
- `entry.runtime_data` voor de store/manager (geen `hass.data[DOMAIN]`).
- Entities: `_attr_has_entity_name = True`, unique_id uit entry_id, device per lijst.
- Services in `services.yaml` + registratie in `async_setup`; events met prefix `ha_tasks_`.
- Typed (`from __future__ import annotations`), ruff-clean, geen magic strings (constanten in `const.py`).

## Tests
- `pytest` + `pytest-homeassistant-custom-component`; venv: `.venv` (uv, Python 3.14).
- Draaien: `.venv/bin/python -m pytest -q`.
- Elke feature krijgt tests (config flow, store, entity, services).

## Structuur
- `custom_components/ha_tasks/` de integratie
- `tests/` pytest
- `docs/vergelijking.md`, `docs/ontwerp.md`
