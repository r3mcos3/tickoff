# Handmatige testchecklist Tickoff (voor Remco)

Doel: in je eigen HA controleren wat de automatische tests niet kunnen. Maak vooraf een HA-backup.

## Wat is al getest (automatisch) en wat niet

| Onderdeel | Hoe getest | Beperking |
|---|---|---|
| Backend (config flow, opslag, todo-entiteit, services, tags, herhaling, sensoren, meldingen, meldingsdoelen, websocket, migratie van oude lijsten) | pytest met `pytest-homeassistant-custom-component` op **HA 2026.10.4** | **Niet** op HA 2026.11 (testbibliotheek nog niet beschikbaar) en niet in een echte HA. |
| Kaart en zijbalk-paneel (renderen, snel toevoegen, bewerken, slepen, tags, instellingen, Telegram-keuze, niet-beheerder, smal scherm, Nederlands) | Echte headless Chromium met een mock van `hass` (~140 controles) plus screenshots bekeken | Geen echte HA-frontend: de iconen (`ha-icon`), `ha-card`, `ha-form` en het kaartkiezer-menu zijn nagebootst. Geen touch/mobiel. |
| Telegram | Tests met een nagebootste notify-entiteit en `notify.send_message` | **Niet** met een echte Telegram-bot: dat moet jij controleren. |
| Update-entiteit (release controleren, installeren met controles, back-up, terugdraaien bij fout, herstartmelding) | pytest met nagebootste GitHub-antwoorden en een tijdelijke kopie van de integratie | Geen echte download van GitHub, geen echte HA-herstart. |
| Blueprint | Alleen YAML-syntaxis | Niet geïmporteerd in HA. |
| Marketplace-installatie | Niet getest | Pas mogelijk na publicatie. |

## Upgrade vanaf 0.1/0.2 (had lijsten)

- [ ] Backup gemaakt. Update via HACS, HA herstarten, Ctrl+F5.
- [ ] Alle taken uit al je lijsten staan nu in één collectie (volgorde en tags behouden). Controleer het aantal taken.
- [ ] Entiteiten: `todo.tickoff`, `sensor.tickoff_open`, `_today`, `_overdue`. De oude `todo.tickoff_<lijst>` en overzicht-sensoren zijn weg; pas automations/dashboards aan.
- [ ] Er staat precies één Tickoff-integratie in Apparaten & diensten.
- [ ] Je oude notify-service staat bij Instellingen → Meldingen als doel.

## Nieuwe installatie

- [ ] HA 2026.11+, backup. Installeer via HACS (custom repository `https://github.com/r3mcos3/tickoff`, Integration), herstart, Ctrl+F5.
- [ ] Integratie toevoegen → Tickoff: er is geen naam/lijst te kiezen; een tweede keer toevoegen wordt geweigerd.
- [ ] **Tickoff** staat in de zijbalk.

## Zijbalk

- [ ] Tickoff in de zijbalk opent altijd op **Alle taken**, ook nadat je eerder een andere weergave (Vandaag, Instellingen, ...) had gekozen.
- [ ] Zijbalk-aantallen bij Vandaag, Binnenkort, Alle taken, Voltooid en per tag kloppen; rood bij achterstallig.
- [ ] **+ Nieuwe taak** (rechtsboven in de kaart) opent een venster met titel, notities, subtaken, datum/tijd, prioriteit, tags en herhaling. Er is geen losse invoerbalk meer.
- [ ] Snel typen in de titel: `Bel mama morgen 14:30 #familie !hoog` — de voorvertoning toont datum, prioriteit en tag; na Enter (of "Taak toevoegen") bestaat de taak met die waarden. Wat je zelf invult wint van de woorden in de titel. Ook Engels en `Water plants every week`.
- [ ] Subtaken bij het aanmaken: typ een subtaak + Enter (meerdere), pas een titel aan, verwijder met ×; opslaan maakt de taak met alle subtaken. Een nog niet bevestigde subtaak-tekst wordt bij opslaan meegenomen.
- [ ] Het venster blijft intact als er op de achtergrond iets wijzigt (typ iets en wacht een minuut / wijzig een taak elders).
- [ ] Annuleren, Esc en buiten het venster klikken sluiten zonder op te slaan; een lege titel of ongeldige datum blokkeert opslaan.
- [ ] Taak aantikken: notities, subtaken, geschiedenis. Subtaak toevoegen/afvinken/verwijderen; de laatste subtaak afvinken voltooit de taak (ook via het bewerkvenster).
- [ ] ✎ bewerken (venster): subtaken toevoegen (Enter), hernoemen, afvinken, verwijderen (direct actief), snelle datumknoppen (Vandaag/Morgen/Volgende week/Geen), prioriteit, tags aan/uit en nieuwe tag, herhaling; Opslaan, Annuleren, Esc en buiten klikken sluiten.
- [ ] ⏰ uitstellen → morgen (tijd blijft). 🗑 vraagt een tweede tik.
- [ ] Afvinken: taak gaat naar "Voltooid" (ingeklapt, klik om te openen); "Voltooide wissen" werkt.
- [ ] Sorteer-knop rechtsboven (⇅): handmatige volgorde, slepen werkt en blijft na verversen.
- [ ] Tagfilter (chips) en 🎨 kleur wijzigen; ook onder "Tags beheren": kleur, hernoemen, verwijderen, nieuw.
- [ ] Zonder taken: vriendelijke lege staat. Donkere modus oogt goed.
- [ ] Telefoon (Companion app): linksboven (☰) opent het **Home Assistant-menu** (zo kom je terug naar de rest van HA), rechtsboven de lijst-knop opent Tickoffs weergaven (tik naast het menu om te sluiten); de kaart-kop past op de breedte (titel, tellers en "+ Nieuwe taak" lopen niet door elkaar). Bijzondere aandacht voor het bewerkvenster en slepen met touch.

## Update-entiteit

- [ ] `update.tickoff` (de update-entiteit van Tickoff zelf; `update.tickoff_update` is van HACS) bestaat (Instellingen → Systeem → Updates en op de integratiepagina). Bij een nieuwere release op GitHub staat hij op "beschikbaar" met release-notities; staat HA op de nieuwste, dan "up-to-date".
- [ ] Tickoff → Instellingen → Updates toont versie en knop **Update installeren** (alleen beheerder); in het menu staat een stip bij Instellingen als er een update is.
- [ ] Installeren: na afloop staat er een melding onder Instellingen → Systeem → Reparaties ("Herstart Home Assistant …") met een knop die herstart. Na de herstart is de nieuwe versie actief en de melding weg. De vorige versie staat in `/config/.storage/tickoff_backup/<versie>/`.
- [ ] Zonder internet blijft Tickoff werken (de update-entiteit meldt dan gewoon geen update).
- [ ] Met HACS: er zijn twee update-entiteiten (HACS: `update.tickoff_update`, Tickoff: `update.tickoff` of `_2`). Beide tonen dezelfde versies; **één** keer installeren (via welke dan ook) zet beide op "up-to-date" — je hoeft niet twee keer te installeren. Tickoff's knop laat HACS het werk doen (je ziet HACS' eigen herstartmelding).
- **Niet getest:** een echte update van GitHub (alleen met nagebootste downloads en een tijdelijke map), de reparatie-herstartknop in de echte HA-frontend.

## Datum en tijd

- [ ] Overal 24-uurs tijd (`17:30`, nooit AM/PM) en datums als `dd-mm-jjjj`, ook in het bewerkvenster, het toevoegveld en bij de meldtijd.
- [ ] Typen `1703` wordt `17:03`, `12032026` wordt `12-03-2026`; een ongeldige datum/tijd kleurt rood en wordt niet opgeslagen. Het kalender-icoontje opent een datumkiezer die `dd-mm-jjjj` invult.

## Meldingen en Telegram

- [ ] Instellingen → Meldingen: je Telegram-bot-entiteit staat bovenaan met een blauwe **Telegram**-badge (de naam is bijv. "Home Assistant Remco"). Is hij er niet? Meld de entiteit-id (Ontwikkelhulpmiddelen → Toestanden, filter `notify.`).
- [ ] Vink Telegram aan, zet de meldtijd op bijv. `18:45` en klik **Opslaan**: keuze en tijd blijven staan, ook na verversen (dit sprong eerder terug naar de oude waarden). Klik daarna **Testbericht sturen**: er komt een bericht "Test notification from Tickoff ✅" in Telegram.
- [ ] Vink ook je telefoon aan: de test komt op beide.
- [ ] Taak voor vandaag zonder tijd, aangemaakt vóór de meldtijd → melding op de meldtijd (standaard 08:00), één keer, ook na een HA-herstart.
- [ ] Taak met tijd → melding op die tijd. Taak voor vandaag ná de meldtijd aangemaakt → geen melding (bewust).
- [ ] Uitgestelde taak meldt morgen; herhalende taak meldt bij de volgende datum opnieuw.
- [ ] Niet-beheerder: instellingen alleen lezen.
- [ ] Event `tickoff_task_due` is te zien in Ontwikkelhulpmiddelen → Gebeurtenissen. Blueprint importeren en testen.

## Herhaling (korte patronen)

- [ ] Dagelijks: afvinken → morgen, taak blijft open, subtaken weer leeg.
- [ ] Wekelijks ma+do: afvinken op dinsdag → donderdag. Maandelijks op de 31e → 28 feb → 31 mrt. "N dagen na afvinken": vandaag + N.
- [ ] Geschiedenis toont `completed` met `next_due`.

## Sensoren

- [ ] Vandaag zonder tijd = *vandaag*; met tijd in het verleden = *achterstallig*; gisteren = achterstallig. Zonder verversen schuift een taak op de klok van *vandaag* naar *achterstallig*.

## Bekende beperkingen

- Tijdzones: "vandaag" volgt de tijdzone van HA.
- Geen calendar-entiteit en geen koppeling met externe takenlijsten (Todoist, CalDAV).
- Slepen in de handmatige volgorde is alleen met een muis getest.
- Meldingsdoelen: alleen `notify`-services en -entiteiten (Telegram-bot-entiteit, mobiele app, ...).
