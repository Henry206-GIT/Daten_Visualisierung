"""Zentrale Konfiguration: Quell-URLs, Pfade, tidy-Schema."""
import os
from pathlib import Path

BASE = Path(__file__).resolve().parent
RAW = BASE / "data" / "raw"
PROCESSED = BASE / "data" / "processed"

# tidy Long-Format Spalten (jede processed/*.csv haelt sich daran)
SCHEMA = [
    "indikator", "jahr", "region", "region_typ",
    "gruppe", "gruppe_typ", "wert", "einheit", "quelle",
]

# --- Quellen (alle frei / ohne Auth) ---
EUROSTAT_BASE = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data"
# allgemeines Vertrauen (Skala 0-10), DE, mit Alter/Geschlecht/Bildung, Jahre 2013-2025
EUROSTAT_TRUST = "ilc_pw03"

BUNDESWAHL_KERG2 = (
    "https://www.bundeswahlleiterin.de/bundestagswahlen/2025/"
    "ergebnisse/opendata/btw25/csv/kerg2.csv"
)

# offenes GeoJSON der Bundeslaender (vereinfachte Geometrie)
GEOJSON_LAENDER = (
    "https://raw.githubusercontent.com/isellsoap/deutschlandGeoJSON/"
    "main/2_bundeslaender/2_hoch.geo.json"
)

# Destatis GENESIS-Online: Upgrade-Pfad (Token noetig), hier nicht aktiv.
DESTATIS_TOKEN = os.environ.get("DESTATIS_TOKEN")
