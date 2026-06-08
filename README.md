# Politische Meinung & Politikverdrossenheit – DE (lokale Visualisierung)

Interaktive Mass-Data-Visualisierung der politischen Meinung deutscher Bürger aus
**offenen, ohne Login abrufbaren** Quellen. Läuft lokal auf `localhost`.

## Quellen (auto-fetch, frei)

| Quelle | Inhalt | Lizenz |
|---|---|---|
| Eurostat `ilc_pw03` | allgemeines Vertrauen (Skala 0-10), DE, nach Alter/Bildung/Geschlecht, 2013–2025 | Eurostat |
| Bundeswahlleiterin BTW 2025 (`kerg2`) | Wahlbeteiligung + Zweitstimmenanteile je Bundesland (2021 & 2025) | DL-DE-BY-2.0 |
| isellsoap/deutschlandGeoJSON | Bundesland-Geometrien | siehe Repo |

**Wahlbeteiligung dient als Proxy für Politikverdrossenheit.**

### Bekannte Daten-Lücken (Upgrade-Pfad, nicht auto-fetchbar)
- **GESIS Politbarometer / ALLBUS** – institutionelles & Parteien-Vertrauen, politische
  Einstellungen. Login + manueller SPSS-Download → Dateien nach `data/raw/`, eigenes
  Ingest-Modul ergänzen.
- **Destatis GENESIS-Online** – Wahlbeteiligung-Langzeitreihe, Demografie. Kostenloser
  Token (`genesis.destatis.de`) → `DESTATIS_TOKEN` env-var, Wrapper `pystatis`.

## Setup

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

## Daten holen

```bash
.venv/bin/python ingest/run_all.py
```
Schreibt tidy-CSV nach `data/processed/` (Schema: `indikator, jahr, region, region_typ,
gruppe, gruppe_typ, wert, einheit, quelle`).

## App starten (localhost)

```bash
.venv/bin/streamlit run app/Home.py
```
→ http://localhost:8501

## Seiten
- **Zeitreihen** – Vertrauen & Wahlbeteiligung über die Jahre
- **Karten** – Choropleth je Bundesland (Beteiligung / Parteianteile)
- **Demografie** – Vertrauen nach Alter, Bildung, Geschlecht
- **Korrelation** – dichte Übersicht: Beteiligung vs. Parteien je Land
