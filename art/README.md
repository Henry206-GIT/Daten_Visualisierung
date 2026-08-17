# Politische Stimmung — Vier Ansichten

Künstlerische Mass-Data-Visualisierung der politischen Meinung in Deutschland für eine
politische Ausstellung. Dieselben offenen Daten, vier ästhetische Sprachen — jede als
eigenständiges, fullscreen-/projektionstaugliches Web-Stück.

| # | Stück | Framework | Konzept |
|---|-------|-----------|---------|
| 01 | Der zerfallende Souverän | **p5.js** | Partikel = Wähler; Nichtwähler zerfallen zu Asche (Politikverdrossenheit). Loop durch 16 Länder. |
| 02 | Stimmungsgebirge | **three.js** | 16 leuchtende Türme, Höhe = Beteiligung, Segmente = Parteien, langsame Kamerafahrt. |
| 03 | Glühende Republik | **deck.gl** | Deutschland als Lichtkarte; Bundesländer glühen nach Wert, Indikatoren wechseln im Takt. |
| 04 | Die Kunst der Klarheit | **D3** | Editorial-Broadsheet: Vertrauen, Parteien, Länder — typografisch streng. |
| 05 | Kern & Verdrossenheit | **p5.js** | Heller, parteifarbener Leuchtkern der Wähler; drumherum ein matter Partikelring = Politikverdrossenheit. |
| 06 | Drei Welten | **p5.js** | Eine Welt wandert durch drei Zustände: 0 % (grauer Ring), wie heute (BTW 2025), 100 % (heller Kern). `?e=0..1` friert einen Zustand ein. |
| 07 | Wähler-Sturm | **p5.js · interaktiv** | Start: neutrale graue Sphäre (alle Stimmen). Dropdowns oben links (Bundesland → Partei) transformieren live: Bundesland = stärkste Partei als Kern + andere als Sphären; Partei = deine Partei als Kern. Felder leeren → wieder neutral. Größe ∝ echte Zweitstimmen. Live-Regler. Toggle **Kürzel**: Partikel jeder Sphäre formen das Partei-Kürzel (AfD-Sphäre → „AfD"). `?land=&partei=&text=1` als Direkt-Hook. |
| 08 | Dein Partikel | **p5.js · Ausstellung** | Kopie von 07 mit Intro: Name eintippen → der Partikel steigt lange durch dunklen Raum, die **Kamera verfolgt** ihn; die **feste Partikel-Wand** (stark reingezoomte Sphäre) scrollt von oben ins Sichtfeld, sobald er nah ist; dann **zoomt die Kamera raus** bis zur Default-Sphäre und die UI blendet ein. Welt-Kamera (Pan+Zoom). „Intro neu"-Button. **Hand-Tracking**: Webcam-Hand schiebt die Partikel beiseite (MediaPipe HandLandmarker, WASM komplett lokal aus `vendor/` — kein CDN, das Kamerabild verlässt das Gerät nie); bis zu 2 Hände, radiale Abstoßung + Mitreiß-Impuls, die Feder holt alles zurück — Daten/Allokation unverändert. Knopf „✋ Hand" (nur mit Kamera) + Regler Hand-Radius/-Kraft. **Voraussetzung: sicherer Kontext** — Kamera-API gibt es nur über HTTPS (Pages-URL) oder `localhost`; über `http://<LAN-IP>` zeigt der Knopf „nicht verfügbar" mit Begründung. Die Permission-Abfrage kommt pro Gerät/Browser einmal — „Zulassen" wird pro Origin gemerkt. Kiosk: einmal erlauben oder Chrome mit `--use-fake-ui-for-media-stream` starten. Hooks: `?skipintro=1`, `?flight=0..1&name=`, `?hand=0/1`, `?embed=1[&standby]`. |
| 09 | Dein Ort | **globe.gl · Kiosk** | Museums-Kiosk: 3 Fragen (Alter → Partei → Wohnort per Ort/PLZ, Offline-Geocoding via `plz.json`) → Datenpunkt fliegt auf einen **schwarz-weißen Globus** (Wireframe + Grid), Kamera taucht nach Deutschland ab, Landung exakt am eigenen Ort. Danach freies Erkunden: **Hologramm-Heatmap** aus halbtransparenten Quadraten (blau=kalt → rot=heiß, heiße Zellen höher, Konturen bleiben sichtbar) zeigt, wo Menschen so geantwortet haben wie du; **Zoom-LOD** — beim Reinscrollen wird das Raster feiner (bis Stadt-Ebene), Zellen unter der Maus heben sich; **Filter-Menü** oben rechts (Altersgruppe × Partei, Default = eigene Antworten, echte RWS-Altersdaten, Heatmap passt sich live an) + **Ansicht-Regler** (Transparenz, Raster, Relief, Glätte, Kontrast, Kälte); **drei Zoom-Stufen**: weit draußen Bundesland-Choropleth, mittig der Hex-Teppich, nah das feine Raster mit betonten **Kreis-Grenzen**; **mittlere Maustaste kippt** die Ansicht (Seitenblick aufs Relief); **Klick auf Bundesland** öffnet Detail-Fenster links (Filter-Trefferquote, Top-Partei je Altersgruppe, BTW-Sieger, Beteiligung). Daten: localStorage + BTW-2025-Seed. Scroll-Zoom/Drag, **60 s Idle → Reset**. **Drei Karten** per Umschalter: „Wer ist wie du?" (BTW), „Butter oder Nutella?" und „Herzens-Orte" (beide rein besucher-generiert — antworten und sofort Teil des Datensatzes werden, localStorage pro Station). **Länder-Varianten** `?land=fr` / `?land=it`: Heatmap der Einwohnerdichte über Frankreich/Italien (Regionen statt Bundesländer, GeoNames cities5000 CC-BY, Karten 2/3 mit eigenem Speicher). Hooks: `?skipintro&plz=&age=&party=&map=1..3&detail=Bayern`, `?fly=PLZ`, `?embed=1&name=` (Hub), `?pov=lat,lng,alt`, `?fast`, `?idle=5`. |
| 10 | Der Partikel-Hub | **Shell · Kiosk** | Verbindet alles: Onboarding erschafft **deinen Partikel** (Name → Alter → Partei → Wohnort), dann das Menü als **zerrissene Realität**: der Bildschirm ist in drei Scherben gespalten (Riss von der Mitte), in jeder läuft die Welt **live als Vorschau** — links der Partikelsturm, rechts der Globus, unten die AR-Scherbe mit QR-Code; leuchtende Riss-Kanten, der Partikel schwebt im Zentrum. Ganze Scherbe = Portal. Jede Auswahl ist ein sichtbarer Partikel-Flug: Klick auf eine Scherbe → der Partikel schwebt über dem Namen der Welt; zweiter Klick → er taucht ein und die Welt startet (09 direkt mit Karte 1, Karten-Wechsel oben in der Welt) (iframe im `?embed=1`-Modus, `postMessage exit` zurück). Zurück-Knopf/Idle → Partikel fliegt sichtbar zurück ins Menü. Welt 3 = Platzhalter mit fertiger Schnittstelle. Hooks: `?skip=menu|08|09|3&map=`, `?idle=5`. |

## Daten
`data.json` wird aus `../data/processed/*.csv` gebacken:
```bash
../../.venv/bin/python bake_data.py
```
Quellen: Eurostat `ilc_pw03` (allg. Vertrauen) · Bundeswahlleiterin BTW 2025 (`kerg2`,
DL-DE-BY-2.0) · GeoJSON isellsoap/deutschlandGeoJSON. Wahlbeteiligung = Proxy für
Politikverdrossenheit.

## Lokal hosten
```bash
python3 -m http.server 8137 --bind 127.0.0.1   # aus diesem art/-Ordner
```
Dann im Browser:
- Galerie:    http://localhost:8137/
- 01 p5:      http://localhost:8137/01_generativ/
- 02 three:   http://localhost:8137/02_immersiv/
- 03 deck.gl: http://localhost:8137/03_karte/
- 04 D3:      http://localhost:8137/04_editorial/
- 05 p5:      http://localhost:8137/05_partikelsturm/

Für die Ausstellung: Stück öffnen, **F11** (Vollbild). Alle Stücke laufen autonom in
Endlosschleife, brauchen kein Publikum-Input, Cursor ist ausgeblendet. Libraries via CDN
(Internet nötig). Kein Build-Schritt.
