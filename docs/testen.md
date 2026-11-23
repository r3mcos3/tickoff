# Handmatige testchecklist Tickoff (voor Remco)

Doel: in je eigen HA controleren wat de automatische tests niet kunnen. Doe dit eerst op een testlijst, niet op
belangrijke data. Maak vooraf een HA-backup.

## Wat is al getest (automatisch) en wat niet

| Onderdeel | Hoe getest | Beperking |
|---|---|---|
| Backend (config flow, opslag, todo-platform, services, tags, herhaling, sensoren, meldingen, websocket) | pytest met `pytest-homeassistant-custom-component` op **HA 2026.10.4** | **Niet** op HA 2026.11: de testbibliotheek is nog niet voor 2026.11 uitgebracht (kon niet worden geïnstalleerd, zie hieronder). Niet in een echte HA-instantie. |
| Zijbalk-paneel (navigatie, lijsten maken/hernoemen/verwijderen, tags, instellingen, niet-beheerder, smal scherm) | Backend: pytest (websocket, paneelregistratie, statische bestanden, adminrechten). Frontend: headless Chromium met mock (42 controles) | Geen echte HA-frontend, geen echte zijbalk, geen touch. |
| Kaart (renderen, filteren, acties, slepen, bewerken, vandaag-weergave, editor, Nederlands/12-uurs) | Echte headless Chromium met een mock van `hass` (58 controles) | Geen echte HA-frontend: `ha-card`, `ha-form` en het kaartkeuzemenu zijn niet echt getest; geen touch, geen mobiel, geen echte websocket. |
| Meldingen | Tests met vervalste tijd en een nepservice `notify.*` | Niet met een echte telefoon/Telegram. |
| Blueprint | Alleen YAML-syntaxis | Niet geïmporteerd in HA. |
| Marketplace-installatie | Niet getest | Pas mogelijk na publicatie; knop-URL gekopieerd van een andere integratie. |

HA 2026.11.2 zelf is wel geïnstalleerd in een aparte omgeving, maar `pytest-homeassistant-custom-component 0.13.375`
(laatste versie, voor 2026.10.4) importeert iets dat in 2026.11 verdwenen is (`homeassistant.components.logger._clear_logger_overwrites`)
en botst op de nieuwe `httpx`-aliasing. Tests op 2026.11 zijn dus **niet gedraaid**.

## Installeren

- [ ] HA is 2026.11 of nieuwer, backup gemaakt.
- [ ] Installeer via HACS (custom repository `https://github.com/r3mcos3/tickoff`, categorie Integration) of de Marketplace.
- [ ] HA herstarten. In het log staat geen fout over `tickoff` (Instellingen → Systeem → Logs).
- [ ] Browser hard verversen (Ctrl+F5).

## Lijst aanmaken

- [ ] Instellingen → Apparaten & diensten → Integratie toevoegen → Tickoff → naam `Test`.
- [ ] Er verschijnt `todo.tickoff_test` met de vriendelijke naam **Test** (niet "Tickoff Test").
- [ ] Er verschijnt automatisch een tweede item **Tickoff** (overzicht) met `sensor.tickoff_open`, `_today`, `_overdue`.
- [ ] Maak een tweede lijst `Test 2`: er komt **geen** tweede overzicht.
- [ ] Dubbele naam (`test`) wordt geweigerd.

## Standaard todo-kaart / Companion app

- [ ] Voeg een taak toe met notities en vervaldatum, daarna met datum + tijd. Beide verschijnen goed.
- [ ] Afvinken en weer openen werkt. Slepen van volgorde werkt (todo-kaart).
- [ ] Bewerk titel in de todo-kaart: prioriteit en tags (zie hieronder) blijven behouden.
- [ ] Companion app/Assist ("voeg X toe aan Test") werkt.

## Zijbalk-paneel (menu-item "Tickoff")

- [ ] Na installatie staat **Tickoff** in de zijbalk (ook na Ctrl+F5). Open het.
- [ ] Zonder lijsten: melding "Nog geen lijsten" met knop; **Nieuwe lijst** maakt een lijst (naam + optioneel notify-service) en opent hem.
- [ ] Zijbalk-aantallen: Vandaag, Alle taken en per lijst kloppen; rood bij achterstallig.
- [ ] Vandaag-/Alle-taken-/lijstweergave: taken toevoegen, afvinken, filteren (zelfde kaart als op een dashboard). Filter blijft staan als er iets wijzigt.
- [ ] Lijst hernoemen: naam verandert in paneel en overal; `todo.tickoff_<oude naam>` blijft hetzelfde entity-id; taken blijven.
- [ ] Notify-service per lijst wijzigen/wissen (dropdown) werkt en blijft na verversen.
- [ ] Lijst verwijderen: eerste klik vraagt "Zeker?", tweede verwijdert lijst en taken; entiteiten verdwijnen.
- [ ] Dubbele lijstnaam geeft een foutmelding in het paneel.
- [ ] Tags: kleur wijzigen, hernoemen, verwijderen (twee kliks), nieuwe tag. Aantallen kloppen.
- [ ] Instellingen: standaard notify-service en meldtijd opslaan ("Opgeslagen"), blijft na verversen.
- [ ] Niet-beheerder (apart testaccount): geen Nieuwe lijst, geen hernoemen/verwijderen, instellingen alleen lezen; taken werken wel.
- [ ] Telefoon (Companion app): menu-knop in het paneel opent de lijstnavigatie; de rest bruikbaar (niet getest, kan beperkingen hebben).

## Tickoff-kaart

- [ ] Dashboard bewerken → kaart toevoegen → **Tickoff** staat in de kaartkiezer; de visuele editor opent en slaat op.
- [ ] Lijstweergave: taak toevoegen (Enter en knop), meer opties (⚙) met datum, tijd, prioriteit, tags, herhaling.
- [ ] Tags krijgen een kleur; tag-chip aantikken filtert; 🎨 verandert een kleur (ook in de andere lijst).
- [ ] Tik op een taak: notities, subtaken, geschiedenis. Subtaak toevoegen/afvinken/verwijderen. Laatste subtaak afvinken voltooit de taak.
- [ ] ✎ bewerken (alles incl. herhaling), ⏰ uitstellen (datum wordt morgen, tijd blijft), 🗑 vraagt een tweede tik.
- [ ] Slepen op het ⋮⋮-handvat verandert de volgorde en blijft na verversen.
- [ ] "Voltooide wissen" verwijdert alleen afgevinkte taken.
- [ ] Vandaag-weergave (`view: today`): achterstallig bovenaan, dan vandaag, over alle lijsten.
- [ ] `read_only: true`: niets te wijzigen. `hide_when_empty: true`: kaart verdwijnt als er niets is.
- [ ] Tijd-notatie volgt je profiel (12/24 uur). **Mobiel** (Companion app): kaart bruikbaar, slepen werkt met touch (niet getest, kan een beperking zijn).
- [ ] Kaart live: wijzig een taak via een service/Ontwikkelhulpmiddelen, de kaart past zich zonder verversen aan.

## Herhaling

Test met korte patronen:
- [ ] Dagelijks: taak met datum vandaag afvinken → morgen, taak blijft open, subtaken zijn weer leeg.
- [ ] Wekelijks ma+do: afvinken op een dinsdag → donderdag.
- [ ] Maandelijks op de 31e → februari 28e, daarna weer 31 maart.
- [ ] "N dagen na afvinken" (bijv. 3): afvinken → vandaag + 3.
- [ ] Geschiedenis toont `completed` met `next_due`; `last_completed_at` staat via `tickoff.get_tasks`.

## Sensoren

- [ ] Een taak vandaag zonder tijd telt als **vandaag**; met een tijd in het verleden telt als **achterstallig**; gisteren = achterstallig.
- [ ] Een taak met tijd over 2 minuten gaat zonder verversen van *vandaag* naar *achterstallig*.
- [ ] `sensor.tickoff_overdue` heeft in het attribuut `tasks` de titels.

## Meldingen

- [ ] Zet bij de overzichts-entry (**Configureren**) een notify-service (bijv. `mobile_app_<telefoon>`) en meldtijd.
- [ ] Taak voor vandaag zonder tijd, aangemaakt **vóór** de meldtijd → melding op de meldtijd, één keer (ook na een HA-herstart).
- [ ] Taak met tijd → melding op die tijd, niet om 08:00.
- [ ] Taak voor vandaag **ná** de meldtijd aangemaakt → geen melding (bewust).
- [ ] Uitgestelde taak (⏰) meldt morgen. Herhalende taak meldt bij de volgende datum opnieuw.
- [ ] Per-lijst service (lijst → Configureren) wint van de globale. Ontbrekende service geeft alleen een waarschuwing in het log.
- [ ] Het event `tickoff_task_due` is te zien in Ontwikkelhulpmiddelen → Gebeurtenissen (luisteren). Blueprint importeren en testen.

## Tags in uitgeschakelde lijst

- [ ] Schakel `Test 2` uit (Apparaten & diensten → ⋮ → Uitschakelen), hernoem een tag via `tickoff.rename_tag`, schakel in: de tag heet daar ook nieuw.

## Opruimen

- [ ] Lijst verwijderen (Apparaten & diensten) → taken zijn weg (`.storage/tickoff.<entry_id>` verdwijnt), tags blijven in het register.

## Bekende beperkingen

- Tijdzones: "vandaag" volgt de tijdzone van HA.
- Tags zijn globaal; er is nog geen UI om ongebruikte tags op te ruimen behalve `tickoff.delete_tag`.
- Taken worden alleen in de kaart/todo-entiteit getoond; er is (nog) geen calendar-entiteit.
- Geen koppeling met externe lijsten (Todoist, CalDAV).
