# Ontwerp Tickoff

> Tickoff: tasks for Home Assistant. Domein `tickoff`, entiteiten `todo.tickoff_<lijst>`.

Standalone HA custom integration voor taken. Geen afhankelijkheid van Keepr; Keepr is alleen de bron van de kernfeatures. Zie `vergelijking.md` voor het waarom.

## Principes
1. Klein, coherent model; geen feature-toggle-doolhof.
2. Betrouwbaarheid boven breedte: meldingen exact één keer, tellers kloppen, herhaling zonder gestapelde duplicaten.
3. Alles in HA zelf (`Store`), meegenomen in HA-backups. Geen cloud, geen externe sync (voorlopig).
4. Eén bron van waarheid per lijst: de `TaskManager`; entities, sensoren, services en kaart zijn views daarop.

## Kernfeatures (uit Keepr)
- Taak: titel, notities, due date + optionele tijd, prioriteit (geen/laag/midden/hoog; "herinnering" is een melding, geen prioriteit).
- Tags met kleur (register) + filter.
- Subtaken; ouder wordt automatisch voltooid als alle subtaken klaar zijn.
- Herhaling met rollover bij afvinken: dagelijks, wekelijks (weekdagen), maandelijks, jaarlijks, "X dagen na afvinken". Bij afvinken schuift de vervaldatum door (subtaken worden teruggezet), taak blijft bestaan.
- Achterstallig-teller, vandaag-overzicht.
- Snooze naar morgen.
- Afvinken (doorgestreept, onderaan), bulk-verwijderen voltooide taken.
- Handmatige volgorde.
- Melding op vervaldag: 08:00 of op de ingestelde tijd, ontdubbeld.
- Verbetering t.o.v. Keepr: `completed_at` + geschiedenis per taak.

## Datamodel (Store, versie 1)
Per config entry (= één lijst) `.storage/tickoff.<entry_id>`:

```json
{
  "version": 1,
  "tasks": [
    {
      "id": "uuid4",
      "title": "…", "notes": "",
      "due_date": "2026-12-01", "due_time": "08:30" ,
      "priority": 0,
      "tags": ["tuin"],
      "status": "open|done",
      "completed_at": null,
      "recurrence": null,
      "subtasks": [{"id": "…", "title": "…", "done": false}],
      "position": 0,
      "created_at": "…", "updated_at": "…",
      "notified_for": "2026-12-01",
      "history": [{"at": "…", "event": "created|completed|reopened|snoozed|rescheduled"}]
    }
  ],
  "tags": {"tuin": {"color": "#2e7d32"}}
}
```

- `recurrence`: `{"type": "daily|weekly|monthly|yearly|after_completion", "interval": 1, "weekdays": [0,2], "days": 3}`.
- `notified_for`: de vervaldatum waarvoor al gemeld is; zorgt voor ontdubbeling over herstarts.
- Tags zijn gedeeld over entries? Beslissing: **per lijst** in M1-M5 (eenvoudig); heroverwegen bij M7 (globaal register, zie open vragen).
- Migraties via `Store(…, minor_version, async_migrate_func)`.

## Entiteiten (per lijst = per config entry = één device)
| Platform | Entity | Inhoud |
|---|---|---|
| `todo` | `todo.<lijst>` | `TodoListEntity` (CREATE/UPDATE/DELETE/MOVE/SET_DUE_DATE/SET_DUE_DATETIME/SET_DESCRIPTION); status needs_action/completed |
| `sensor` | open / today / overdue | aantallen; attributen met titels (beperkt) |
| `binary_sensor` | overdue | `on` zolang er iets achterstallig is |
| `calendar` (M7) | taken met due date | optioneel |
| `sensor` (M6) | `sensor.<…>_today` over alle lijsten | "vandaag"-overzicht (ook als aparte hub-entry) |

Core `TodoItem` kent geen prioriteit/tags/subtaken/herhaling; die zitten in eigen services en in de kaart. Via de todo-entity (Companion, Assist) werkt titel/notities/due/status/volgorde en afvinken van herhalende taken doet de rollover.

## Services (domein `tickoff`)
`add_task`, `update_task`, `complete_task`, `reopen_task`, `snooze_task` (naar morgen), `delete_task`, `delete_completed`, `reorder_tasks`, `add_subtask` / `update_subtask` / `remove_subtask`, `set_tag` (kleur) / `delete_tag` / `rename_tag`, `get_tasks` (met `SupportsResponse.ONLY`, filter op status/tag/due) voor automations/Assist.

## Events
`tickoff_task_created`, `_completed`, `_reopened`, `_snoozed`, `_due` (de ontdubbelde melding-trigger), `_overdue`. Payload: `entry_id`, `list_name`, `task_id`, `title`, `due_date`, `due_time`, `priority`, `tags`.

## Meldingen
- Scheduler per entry (`async_track_time_change` op 08:00 + `async_track_point_in_time` voor taken met een tijd; herplannen na elke wijziging).
- Een taak meldt **één keer per vervaldag**: bewaard in `notified_for`, restart-bestendig, tijd injecteerbaar in tests.
- Meldingen = event `tickoff_task_due` + meegeleverd blueprint (notify-service naar keuze, bv. Telegram); optioneel option "notify service" in de options flow in M5.
- Geen wachten op triggers in blueprints, zodat het een HA-herstart overleeft.

## Opslag-keuze
HA `Store` (JSON in `.storage`): honderden taken, geen tijdreeksen. Eigen database is overkill. Writes gedebounced (`async_delay_save`).

## Config flow
- User step: lijstnaam (uniek); optie "melding om" (HH:MM, standaard 08:00).
- Options flow: meldtijd, notify aan/uit, prioriteits-weergave.
- Eén entry per lijst; verwijderen van een entry ruimt Store op (`async_remove_entry`).
- Later: hub-entry voor vandaag-overzicht over lijsten.

## UI
1. **MVP**: standaard todo-kaart (titel/notities/due/status).
2. **Eigen Lovelace-kaart** (M6), geleverd door de integratie en automatisch geregistreerd: lijst met prioriteit-/tag-chips, tag-filter, subtaken in-line, drag & drop, snooze-knop, "voltooide verwijderen", vandaag/achterstallig, 12/24 uurs volgens gebruiker, read-only modus, leeg-verbergen.
3. Visuele editor voor de kaart.

## Mijlpalen
| | Inhoud | Opmerking |
|---|---|---|
| **M1 (MVP-basis)** | manifest, config flow (lijsten), Store, todo-platform (titel/notities/due/status) | scaffold nu |
| **M2** | prioriteit, tags + kleurenregister, services add/update/complete/delete, events | |
| **M3** | subtaken, snooze, bulk-verwijderen, volgorde, auto-voltooien parent | |
| **M4** | herhaling met rollover (5 patronen) | veel tests (DST, maandeinden) |
| **M5** | sensoren open/vandaag/achterstallig, melding 08:00/tijd ontdubbeld, blueprint | **MVP-compleet voor dagelijks gebruik** |
| **M6** | eigen Lovelace-kaart + visuele editor, vandaag-overzicht | grootste werk |
| **M7** | geschiedenis/completed_at-statistiek, calendar-entity, import/export | |
| **M8** | HACS/Marketplace-publicatie, README, brand, vertalingen (EN/NL), release | akkoord van Remco nodig |

Schatting totaal 12–16 dagen; M1–M5 (zonder kaart) ± 5–6 dagen.

## Risico's
- Eigen kaart (frontend-wijzigingen, test op mobiel).
- Herhaling: randgevallen (31e, schrikkeljaar, DST, tijdzones).
- Dicht veld met actieve concurrenten; winnen op samenhang en betrouwbaarheid.
- Todo-platform en HA-versies (Marketplace/HACS-overgang 2026.11) veranderen; tests tegen een vastgepinde HA-versie en periodiek bumpen.
- Migratiepad bij schemawijzigingen in de Store.

## Open vragen (voor Remco)
repo publiek/privé, HACS/Marketplace-publicatie, tags per lijst of globaal, notify-kanaal (alleen event+blueprint of ook ingebouwde notify-service).
