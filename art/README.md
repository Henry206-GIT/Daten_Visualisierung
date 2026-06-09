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
| 08 | Dein Partikel | **p5.js · Ausstellung** | Kopie von 07 mit Intro: ein großer Partikel, Name eintippen → er steigt von unten in eine **Partikel-Wand** (die stark reingezoomte Sphäre); dann **zoomt die Kamera raus** bis zur Default-Sphäre und die UI blendet ein → Wähler-Sturm. Nur Kamera-Zoom. Hooks: `?skipintro=1`, `?flight=0..1&name=`. |

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
