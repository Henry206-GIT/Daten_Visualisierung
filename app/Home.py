"""Einstieg: Übersicht + KPIs. Start: streamlit run app/Home.py"""
import streamlit as st

import components as C

st.set_page_config(page_title="Politische Meinung DE", page_icon="🗳️", layout="wide")

C.header(
    "🗳️ Politische Meinung & Politikverdrossenheit – Deutschland",
    "Mass-Data-Visualisierung aus offenen Quellen (Eurostat, Bundeswahlleiterin)",
)

df = C.load()

st.info(C.GAP_HINWEIS)

c1, c2, c3, c4 = st.columns(4)
trust = C.sel(df, indikator="vertrauen_allgemein", gruppe="gesamt")
turnout = C.sel(df, indikator="wahlbeteiligung", region="Deutschland", jahr=2025)
parteien = C.sel(df, indikator="stimmenanteil", region="Deutschland", jahr=2025)

if not trust.empty:
    j = trust.sort_values("jahr").iloc[-1]
    c1.metric("Allg. Vertrauen (Eurostat)", f"{j.wert:.1f}/10", help=f"Jahr {int(j.jahr)}")
if not turnout.empty:
    c2.metric("Wahlbeteiligung BTW 2025", f"{turnout.iloc[0].wert:.1f} %")
if not parteien.empty:
    top = parteien.sort_values("wert", ascending=False).iloc[0]
    c3.metric("Stärkste Partei 2025", top.gruppe, f"{top.wert:.1f} %")
c4.metric("Tidy-Datenzeilen", f"{len(df):,}".replace(",", "."))

st.divider()
st.subheader("Seiten")
st.markdown(
    "- **Zeitreihen** – Vertrauen & Wahlbeteiligung über die Jahre\n"
    "- **Karten** – Wahlbeteiligung & Parteianteile je Bundesland\n"
    "- **Demografie** – Vertrauen nach Alter, Bildung, Geschlecht\n"
    "- **Korrelation** – dichte Übersicht: Beteiligung vs. Parteien je Land"
)

with st.expander("Datenquellen & Lizenz"):
    st.markdown(
        "- Eurostat `ilc_pw03` – allgemeines Vertrauen (Skala 0-10)\n"
        "- Bundeswahlleiterin – BTW 2025 `kerg2` (Datenlizenz DL-DE-BY-2.0)\n"
        "- GeoJSON Bundesländer – isellsoap/deutschlandGeoJSON\n\n"
        "Upgrade-Pfad (manuell/Token): GESIS Politbarometer/ALLBUS, Destatis GENESIS-Online."
    )
