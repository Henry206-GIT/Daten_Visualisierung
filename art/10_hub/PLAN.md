# Plan: Stück 10 „Der Partikel-Hub" — 08 + 09 + Welt 3 in einer Erfahrung

> Status: **UMGESETZT** (siehe `index.html`/`hub.js` in diesem Ordner sowie die
> Embed-Modi in 08/09). Dieses Dokument beschreibt das Konzept.

## Idee (Kern-Erlebnis)
Die ganze Ausstellung kreist um **einen personalisierten Partikel**:

1. **Onboarding**: Besucher erschafft „seinen" Partikel — Name eingeben (aus 08),
   dann die drei Fragen aus 09 (Alter → Partei → Wohnort/PLZ). Der Partikel trägt
   ab jetzt diese Identität (Name schwebt dran).
2. **Hub-Menü**: Der Partikel schwebt pulsierend in der Mitte. Links und rechts
   liegen die Welten als Portale:
   - **links: Welt 08 „Der Sturm"** (Wähler-Partikelsturm)
   - **rechts: Welt 09 „Dein Ort"** (Globus + Heatmap)
   - **unten mittig: Welt 3 „???"** — Platzhalter ([]),
     gleiche Schnittstelle, Inhalt kommt später
3. **Eintauchen**: Portal wählen → der Partikel **fliegt sichtbar** in diese Welt
   (Animation ohne Schnitt), die Welt startet mit ihrer eigenen Eintritts-Animation
   (08: Aufstieg zur Partikel-Wand; 09: Flug auf den Globus zum Wohnort).
4. **Zurück**: „Zurück"-Knopf (oder Idle) in der Welt → Welt blendet aus, der
   Partikel **fliegt zurück** auf seinen Platz im Hub-Menü. Von dort erneut in
   eine andere Welt.

Alles wirkt wie EIN durchgehender Raum: Man folgt immer demselben Partikel.

## Architektur-Entscheidung
**Shell + eingebettete Welten (iframes) + Partikel als Shell-Ebene.**

08 (p5.js) und 09 (globe.gl/three) sind zwei verschiedene Render-Stacks — sie in
eine Engine zu verschmelzen wäre ein Neuschreiben. Stattdessen:

- **`art/10_hub/`** ist die Shell: eigenes Fullscreen-UI, besitzt den
  DOM-Partikel (Glow-Punkt + Namens-Label) als oberste Ebene (z-index über allem).
- Die Welten laufen **unverändert als eigene Seiten** in versteckten, vorab
  geladenen iframes und bekommen einen kleinen **Embed-Modus** dazu.
- Übergänge choreographiert die Shell: Partikel fliegt (DOM-Animation, easeInOut),
  darunter cross-fadet das iframe. Da die Welten selbst mit einer
  Partikel-Eintritts-Animation starten, entsteht Kontinuität ohne Engine-Bruch.
- 08 und 09 bleiben **standalone weiter lauffähig** (Galerie-Kacheln unverändert);
  Embed-Modus ist rein additiv (`?embed=1`).

## Embed-Vertrag (Welt ⇄ Hub)
**Rein (URL-Parameter):**
`?embed=1&name=…&age=…&party=…&plz=…` — 09 zusätzlich `&map=1|2|3`
(vorgewählte Karte aus dem Portal-Submenü).
- Welt überspringt ihr eigenes Intro/Umfrage und startet direkt mit ihrer
  Eintritts-Animation, gefüttert mit diesen Werten.

**Raus (postMessage an parent):**
- `{ type: 'exit' }` — „Zurück"-Knopf gedrückt ODER Welt-Idle abgelaufen.
- `{ type: 'ready' }` — Welt fertig geladen (Hub blendet erst dann ein).

## Dateien
| Aktion | Pfad |
|---|---|
| neu | `art/10_hub/index.html` (Shell: Onboarding, Menü, iframe-Slots, Partikel-Ebene) |
| neu | `art/10_hub/hub.js` (State-Machine, Flug-Choreo, postMessage, Idle) |
| neu | `art/10_hub/welt3/index.html` (Platzhalter-Welt: schwarz, pulsierender Partikel, „Bald", Zurück) |
| ändern | `art/08_intro_sturm/sketch.js` + `index.html` (Embed-Modus, Zurück-Knopf) |
| ändern | `art/09_dein_ort/app.js` + `index.html` (Embed-Modus, Zurück-Knopf, Idle→exit) |
| ändern | `art/index.html` (Kachel 10), `art/README.md` (Zeile 10) |

Daten: Hub nutzt `../09_dein_ort/plz.json` fürs Orts-Autocomplete (kein Duplikat).
Besucher-Identität: `localStorage hub_visitor_v1` = `{name, age, party, plz, place, state, lat, lng}`.

## Navigations-Prinzip: Kreis-Portale, der Partikel IST der Cursor
Alle Ziele sind **Kreise** (Portal-Ringe). Der Partikel bewegt sich in Stufen —
**jede Auswahl ist ein sichtbarer Flug**, nie ein Schnitt. Es ist jederzeit
transparent, wo der Partikel gerade steht:

1. **Menü-Mitte**: Partikel schwebt zentral, drumherum die Portal-Kreise
   (08 links · 09 rechts · Welt 3 unten), jeweils Ring + Titel.
2. **Klick auf ein Portal** → Partikel **fliegt zu diesem Kreis** und schwebt
   davor (noch NICHT drin). Hat das Portal Unteroptionen, fächern sie jetzt
   **im Kreis um den Partikel** auf — bei 09 die drei Karten
   („Wer ist wie du?" · „Butter oder Nutella?" · „Herzens-Orte") als kleinere
   Ringe. 08/Welt 3 haben (noch) keine Unteroptionen → dort schwebt der
   Partikel vor dem Ring und ein Bestätigungs-Zustand („eintauchen") ist aktiv.
3. **Klick auf den Ziel-Kreis** (Karte 1/2/3 bzw. das Portal selbst) → erst
   JETZT taucht der Partikel **in den Kreis ein** (Flug ins Zentrum,
   schrumpfen/eintauchen) → die Anwendung startet mit genau dieser Auswahl
   (09 bekommt `&map=1|2|3` mit).
4. **Zurück auf jeder Stufe**: Klick ins Leere/Zurück-Knopf → Partikel fliegt
   die Stufe zurück (Unteroptionen klappen ein → Menü-Mitte).

## Hub-State-Machine
`hubState = 'onboarding' | 'menu' | 'portal' | 'enter' | 'world' | 'leave'`

- **onboarding**: Großer Partikel mittig; 4 Schritte (Name → Alter → Partei →
  Ort). UI-Muster aus 09 (eine Frage pro Screen, Enter, Autocomplete). Am Ende
  bekommt der Partikel das Namens-Label → `menu`.
- **menu**: Partikel mittig (sanfter Orbit/Puls), Portal-Kreise drumherum.
  Hover: Ring glüht, Partikel neigt sich leicht dorthin.
- **portal (neu)**: Partikel ist zu einem Portal geflogen und schwebt davor;
  Unteroptionen (z. B. die drei 09-Karten) fächern als Kreise auf. Zurück →
  `menu` (Partikel fliegt zurück zur Mitte).
- **enter (Choreo ~1,5 s)**: Ziel-Kreis fixiert → Partikel fliegt ins
  Kreiszentrum und taucht ein (Scale+Fade) → darunter wird das (vorgeladene)
  iframe sichtbar → Welt spielt ihre eigene Eintritts-Animation mit denselben
  Besucherdaten (+ gewählter Karte) → `world`.
- **world**: Shell unsichtbar. Shell lauscht auf `exit`.
- **leave (Choreo ~1,5 s)**: iframe fadet zu Schwarz → Shell-Partikel erscheint
  in der Bildmitte und fliegt zurück auf seinen Menü-Platz → Menü-UI blendet ein
  → `menu`.

**Idle**: Hub-eigene 60 s im `menu`/`onboarding` (ab Schritt 2) → Reset zu
`onboarding` Schritt 1 (neuer Besucher). In den Welten gilt deren Idle, das im
Embed-Modus `exit` sendet statt selbst zu resetten.

## Änderungen je Welt (minimal-invasiv)
**08 „Der Sturm"** (`?embed=1&name=`):
- Intro-Overlay überspringen, `visitorName` aus Param, direkt `appState='flight'`
  (die bestehende Flug-Sequenz IST die Eintritts-Animation).
- „Zurück"-Knopf (dezent, oben links) → `postMessage({type:'exit'})`.
- Bestehender „Intro neu"-Button bleibt für Standalone; im Embed versteckt.

**09 „Dein Ort"** (`?embed=1&name=&age=&party=&plz=`):
- Umfrage überspringen, Besucher aus Params bauen (wie `?fly=`-Hook, mit
  Persistieren in die Heatmap), Flug+Landung als Eintritt.
- „Zurück"-Knopf → `exit`; Idle-Reset im Embed-Modus → `exit` statt Selbst-Reset.
- Name des Besuchers am gelandeten Punkt anzeigen (kleines Label) —
  stärkt die „das bin ich"-Verbindung.
- **Dauerhaftes Pulsieren auf der Karte**: Der gelandete Besucher-Punkt pulsiert
  permanent (Größe + Glow-Ring im Atem-Rhythmus, ~2 s Zyklus), nicht nur einmal
  beim Landen — man sieht jederzeit klar, WO der eigene Partikel steht, auch
  beim Zoomen/Drehen und auf allen drei Karten.
- Karten-Umschalter (siehe unten) startet mit `&map=` aus dem Hub vorgewählt.

**Welt 3 (Platzhalter)**: schwarze Seite, mittig pulsierender Partikel mit dem
Namen, Text „Diese Welt entsteht noch", Zurück-Knopf → `exit`. Erfüllt den
Embed-Vertrag vollständig → späterer Austausch gegen echte Welt ohne Hub-Änderung.

## 09-Submenü: Drei Karten (Besucher werden Teil der Attraktion)
In Welt 09 kommt ein **Karten-Umschalter** dazu (Panel neben „Wer ist wie du?",
drei große Reiter). Der Partikel/Globus bleibt — nur Datensatz, Farblogik und
Filter-Panel wechseln.

**Karte 1 — „Wer ist wie du?" (bestehend)**
Die heutige Wahl-Heatmap (Wahlkreis-Stimmen × RWS-Alter, Filter Alter × Partei).
Unverändert.

**Karte 2 — „Butter oder Nutella?" (rein besucher-generiert)**
- Beim ersten Öffnen der Karte erscheint die Frage als Overlay im 09-Stil:
  „Was kommt bei dir zuerst aufs Brot?" → zwei große Knöpfe **Butter** / **Nutella**
  (+ „beides/weder" klein). Antwort + Wohnort-Koordinaten des Besuchers werden
  gespeichert → **man wird sofort sichtbarer Teil der Karte** (eigene Zelle
  pulst kurz auf).
- Darstellung: Hex-Teppich wie gehabt, aber **zweifarbig divergierend** —
  Zellfarbe = Mehrheit der Antworten in der Zelle (z. B. Gelb=Butter ↔
  Braun=Nutella, Mischungsgrad = Verhältnis), Höhe = Anzahl Antworten.
  Solange eine Zelle keine Antworten hat, bleibt sie dunkel-neutral —
  die Karte **wächst mit jedem Besucher**.
- Filter-Panel zeigt hier: Antwort-Buttons (nachträglich änderbar) + Zähler
  („n Besucher haben geantwortet · 62 % Butter").
- Speicher: `localStorage viz09_karte2_v1` = Array `{answer, lat, lng, state, ts}`
  (gleiches Muster wie Besucher-Speicher, Cap 5000).

**Karte 3 — „Herzens-Orte" (kreativ, besucher-generiert)**
- Frage beim ersten Öffnen: „**An welchem Ort hängt dein Herz?**" — Ort/PLZ-Feld
  mit demselben Autocomplete (darf irgendwo in Deutschland sein, nicht der
  Wohnort).
- Darstellung: Der Herzens-Ort glüht als warmer Punkt; ein **leuchtender Bogen
  (drei-globe arcsLayer)** spannt sich vom Wohnort zum Herzens-Ort. Mit jedem
  Besucher wächst ein Netz aus Bögen über Deutschland — die Karte zeigt, wohin
  die Herzen der Ausstellung ziehen. Hex-Heat darunter = Dichte der Herzens-Orte
  (wohin zieht es alle?).
- Speicher: `localStorage viz09_karte3_v1` = `{fromLat, fromLng, toLat, toLng, place, ts}`.

**Gemeinsames**
- Umschalter merkt sich pro Besucher, welche Fragen schon beantwortet sind
  (einmal antworten, danach direkt die Karte; Antwort im Panel änderbar).
- Detail-Fenster (Klick auf Bundesland) passt sich an: Karte 2 → Anteil
  Butter/Nutella im Land; Karte 3 → meist-genannte Herzens-Orte im Land.
- Alles bleibt statisch/localStorage — pro Kiosk-Station wächst ihr eigener
  Datensatz (bewusst: „die Besucher DIESER Station").

## Technische Leitplanken (aus 08/09 gelernt)
- Kein Server nötig — alles statisch, läuft lokal (`:8137`) und auf GitHub Pages.
- iframes **vorladen** (hidden) beim Hub-Start; 09 ist asset-schwer (three lokal ✓).
- Cache-Buster-Loader wie gehabt (`hub.js?v=Date.now()`).
- postMessage nur same-origin akzeptieren (`event.origin`-Check).
- Der Shell-Partikel ist reines DOM (wie 09s `#particle`) — überlebt jeden
  Welt-Wechsel, keine WebGL-Kopplung.
- Dev-Hooks: `?skip=menu` (direkt Menü mit Dummy-Besucher), `?skip=08|09|3`
  (direkt in Welt), `?idle=5`.

## Verifikation
1. `node --check` für hub.js + geänderte Dateien.
2. Headless-Screenshots: Onboarding Schritt 1 · Menü mit 3 Portalen + Partikel ·
   `?skip=09` (eingebettete Welt) · Welt 3 Platzhalter.
3. Manuell: kompletter Kreislauf Onboarding → Menü → 08 → zurück → 09 → zurück →
   Welt 3 → zurück; Idle-Resets (Hub + eingebettete Welt); beide Welten weiter
   standalone über ihre alten URLs.
4. Galerie-Kachel 10, Commit + Push, Pages-URL prüfen.

## Offene Punkte (bei Umsetzung entscheiden)
- Portal-Layout final: 08 links / 09 rechts / Welt 3 unten mittig (Annahme) —
  oder drei gleichberechtigte Karten im Bogen um den Partikel.
- Startet 08 im Embed nach dem Flug neutral (wie jetzt) — vermutlich ja.
- Soll der Hub die Galerie-Startseite der Ausstellung werden (Kiosk-Einstieg),
  während die Galerie fürs Web bleibt? (Annahme: Hub = Kachel 10, Galerie bleibt.)
