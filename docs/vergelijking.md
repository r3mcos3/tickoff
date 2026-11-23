# Vergelijking bestaande taken-integraties

Stand 2026-11-23. Bron: READMEs en GitHub-issues van de repo's (via `gh`), geen eigen installatie of test.
Issue-teksten zijn extern en alleen als signaal gebruikt. Getallen (sterren, issues) veranderen snel.

## Overzicht

| | Core Local To-do | Home Tasks | Better ToDo | Chore Calendar |
|---|---|---|---|---|
| Repo | HA core | L3t4l3s/home-tasks | Timmes123/ha-better-todo | tcarney/ha-chore-calendar |
| Gemaakt | n.v.t. | 2026-03 | 2026-08 | 2026-04 |
| Laatste release | n.v.t. | v3.0.1 (17-11) | v1.2.0 (13-11) | v1.0.0 (14-11) |
| Sterren | n.v.t. | 52 | 11 | 30 |
| Open issues | n.v.t. | 2 | 1 | 0 |
| Distributie | core | HACS-default | HACS-default | HA Marketplace (2026.11+), HACS tot 0.14 |
| Licentie | Apache | MIT | MIT | MIT |
| Focus | simpele lijst | huishouden/gezin, kaarten, dagplanning | herhaling, gewoontes, meldingen | herhalende klusjes, kalender |

Alle drie zijn jong (< 9 maanden), actief onderhouden en hebben nauwelijks open issues. Er zit dus al veel in.

## Wat ze doen

### Core Local To-do / todo-platform
- `TodoItem`: titel, status, `due` (datum of datetime), `description`.
- Geen prioriteit, tags, subtaken, herhaling, volgorde-API buiten `move_item`.
- Triggers alleen item toegevoegd/afgevinkt; geen "vervalt nu".

### Home Tasks (de grootste)
- Taken: due date+tijd, prioriteit (laag/midden/hoog), meerdere toegewezen personen, tags, notities, subtaken met voortgang, tot 5 herinneringen per taak, afbeelding (ook AI-gegenereerd), geschiedenis (wie/wanneer).
- Herhaling: elke N uren tot jaren, weekdagen, dag van de maand, "2e zaterdag", jaardatum; start-/einddatum of aantal keer; vanaf afvinken of vaste schema's; vroeg heropenen.
- Per lijst: `todo.*`, `calendar.*`, `sensor.*_open_tasks` (attributen o.a. overdue_count), `binary_sensor.*_overdue`.
- 7 events: created, completed, due (1x per dag), overdue (1x per dag), assigned, reopened, reminder.
- Services: add, add_from_text, get_tasks, update, move, complete, reopen, assign, subtask-services, dagplan-services.
- Kaarten: lijstkaart (lijst/tegels, meerdere lijsten naast elkaar/kanban, secties, drag & drop, filters op persoon/tag, spraakinvoer) en dagplankaart.
- Koppelt externe lijsten (Todoist, Google Tasks, Nextcloud/CalDAV, Bring), tools voor AI-assistenten/MCP, View Assist, 16 talen incl. Nederlands.
- Meldingen: **events, geen eigen push**: de gebruiker bouwt zelf een automation.

### Better ToDo
- Vier taaktypes: eenmalig (zichtbaar-vanaf + deadline-aftelling), vast schema, na afvinken, gewoonte (week/maand met streaks).
- Cron-achtige schema's, laatste dag van de maand, "n-de weekdag", actieve maanden (seizoen), einddatum/maximum.
- "Overdue stapelt niet": één taak met "3x due"; schema-anker driift niet.
- Meldingen **door de integratie zelf**: per taak tot 5 herinneringen, dagelijkse samenvatting, locatievoorwaarde (alleen thuis), herhalen bij achterstand, HA-meldingencentrum. Open roadmap-punt: actionable notifications (afvinken in de push).
- Personen (ook roterend toewijzen), prioriteit 3 of 5 niveaus, tags met filterchips, subtaken, meerdere lijsten met beheer in de kaart, `todo` + `calendar` per lijst (mirror), feature-toggles, gedeelde filters over kaarten, geschiedenis vanaf dag 1.
- Opslag: `.storage/better_todo` (meegenomen in backups). Eigen kaart automatisch geregistreerd, 7 talen incl. Nederlands.
- Roadmap: per-lijst sensoren (open/vandaag/achterstallig), secties/kanban, actionable notifications, ai_task, CalDAV-sync (bewust laatst).

### Chore Calendar
- `todo` + `calendar` per lijst, **een sensor per klusje** met status (pending/due/overdue/completed), taak-eigenschappen.
- Schema's: kalender-raster (dag/week/maand/jaar met ordinalen, seizoensvensters), interval ("N dagen na laatste keer"), oneshot.
- Skip, uitstellen tot later, uncomplete, verberg voltooide (`hide_completed`), NFC-tag-scan om af te vinken.
- Events: chore created, status change, deleted. Eigen tijdlijnkaart met CRUD-dialogs.
- Geen tags, prioriteit, subtaken, assignee alleen als wens.

## Zwakke plekken, open issues en wensen (signalen)

| Bron | Signaal |
|---|---|
| Home Tasks #92 | Subtaken synchroniseren met CalDAV (parent-ID) |
| Home Tasks (gesloten wensen) | Tijd-gebaseerd auto-verwijderen van voltooide taken (#89), per-taak "heropen N dagen voor due" (#77), herhalende taken als "komend" tonen (#64), vaste tag-lijst per lijst (#61), overdue-eerst sortering (#57), auto-voltooien ouder als alle subtaken klaar (#53), toon echte duetijd i.p.v. aftelling (#52), links in notities klikbaar (#62), "niet toegewezen"-filter (#93), wissen-knop in zoekveld (#91), kolommen/tegelgrootte (#76) |
| Home Tasks (bugs/gaps) | Externe lijsten verliezen features (update_task werkt niet, secties slepen werkt niet, #63/#60); herhalende taken verwijderbaar door externe apps (#88); spraak-add herkent geen periodes (#73) |
| Better ToDo #19 | Globale/templatable filters over alle kaarten |
| Better ToDo (gesloten) | 12/24-uurs notatie volgens gebruiker (#18), personen uitsluiten (#17), kaart verbergen als leeg (#6), kaart read-only (#15), herhaling wijzigen volgens schema (#4), "custom element not found" (#11), meldingen werken niet (#7), kaart verliest styling (#2) |
| Chore Calendar (gesloten) | Overdue en komend tegelijk tonen (#39), "alles tonen" (#35), teller "due vandaag" klopt niet (#33), assignee in kaart (#31) |

Terugkerende thema's: (1) kaart-details (tijdnotatie, styling, laden van de custom element), (2) meldingen betrouwbaar en ontdubbeld maken, (3) externe/linked lists blijven achter, (4) opruimen van voltooide taken met een tijdsregel, (5) nauwkeurigheid van tellers (vandaag/achterstallig).

## Waar wij beter kunnen zijn (leidend voor de roadmap)

Eerlijk: de concurrenten dekken **bijna alles** uit de Keepr-kernlijst. Winst zit niet in "meer opties", maar in **samenhang en betrouwbaarheid**, plus een paar Keepr-eigenheden die niemand heeft.

1. **Eén coherente integratie in plaats van veel opties**: geen feature-toggle-doolhof; Keepr-model (titel, notities, due+tijd, prioriteit, gekleurde tags, subtaken, herhaling) zonder keuzestress. Klein oppervlak, goed onderhoudbaar.
2. **Ontdubbelde melding als eerste klas feature**: 08:00 of ingestelde tijd, exact-1x per taak per vervaldag (restart-bestendig, bewaard in Store), met event + meegeleverd blueprint. Home Tasks laat het aan de gebruiker; Better ToDo heeft het, maar de issue-historie (#7) wijst op breekbaarheid. Wij maken het testbaar (tijd injecteren).
3. **Tag-kleuren als register** (Keepr): tag hernoemen/kleur wijzigen/verwijderen werkt door op alle taken; filter in kaart en via service. Home Tasks vroeg om vaste tag-lijst (#61).
4. **Snooze naar morgen** (1 tik/service) en **auto-voltooien parent bij alle subtaken klaar** (Keepr, vraagt Home Tasks #53 aan).
5. **Bulk-verwijderen voltooide + tijdregel** ("na N dagen"), met veilige herhaling: voltooide herhalende taken blijven nooit weg (Home Tasks #88).
6. **Geschiedenis met `completed_at`** als eerste klas data (voltooid-tijdstempels, ook voor herhalingen), voor statistiek (streak/aantal per week) later.
7. **Juiste tellers**: sensoren "open / vandaag / achterstallig" met één duidelijke definitie en tests rond dag-/DST-grenzen (Chore Calendar #33 laat zien dat dit misgaat).
8. **Vandaag-overzicht**: sensor + todo-achtige lijst "vandaag" over alle lijsten heen (Keepr `/vandaag`), die niet per lijst terugkomt bij de concurrenten, behalve het dagplan van Home Tasks (zwaarder).
9. **Heldere kaart zonder gedoe**: geen aparte resource-installatie, goed 12/24-uurs, "overdue-first", read-only modus, leeg-verbergen (de hierboven genoemde wensen voor kaarten zijn voor ons gratis bij start).
10. **Bewust NIET (nu)**: externe lijsten (Todoist/CalDAV), AI-afbeeldingen, dagplan, locatie-meldingen, gewoonte-streaks. Dat is het terrein waar Home Tasks en Better ToDo al sterk zijn; volgen zou concurreren op hun sterkste punten.

## Risico's uit de vergelijking
- Dicht veld: twee actieve projecten met veel features en snelle releases; wij moeten op eigenheid en kwaliteit winnen, niet op breedte.
- HA 2026.11 Marketplace/HACS-wijzigingen: distributie moet daarop voorbereid zijn (open keuze voor Remco).
- Eigen kaart is het grootste werk; reken op meerdere iteraties.
