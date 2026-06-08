"""Gemeinsame Helfer: Daten laden (cached), GeoJSON, Konstanten."""
import json
import sys
from pathlib import Path

import pandas as pd
import streamlit as st

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import config  # noqa: E402

# grosse Parteien fuer Default-Auswahl
HAUPTPARTEIEN = ["CDU", "SPD", "AfD", "GRÜNE", "FDP", "CSU", "Die Linke", "BSW"]


@st.cache_data
def load() -> pd.DataFrame:
    """Alle processed/*.csv zu einem tidy DataFrame concatenieren."""
    frames = []
    for p in sorted(config.PROCESSED.glob("*.csv")):
        frames.append(pd.read_csv(p))
    if not frames:
        return pd.DataFrame(columns=config.SCHEMA)
    return pd.concat(frames, ignore_index=True)


@st.cache_data
def load_geo() -> dict:
    p = config.PROCESSED / "geo_bundeslaender.json"
    return json.loads(p.read_text()) if p.exists() else {}


def sel(df, **kw) -> pd.DataFrame:
    """Bequeme Gleichheits-Filter: sel(df, indikator='wahlbeteiligung')."""
    for k, v in kw.items():
        df = df[df[k] == v]
    return df


def header(titel: str, untertitel: str = ""):
    st.title(titel)
    if untertitel:
        st.caption(untertitel)


GAP_HINWEIS = (
    "ℹ️ **Daten-Lücken (nicht auto-fetchbar):** Institutionelles & Parteien-Vertrauen "
    "(GESIS Politbarometer/ALLBUS) und Destatis-Langzeitreihen erfordern Login/Token. "
    "Hier gezeigt: Eurostat (allgemeines Vertrauen) + Bundeswahlleiterin (BTW 2025). "
    "Wahlbeteiligung dient als Proxy für Politikverdrossenheit."
)
