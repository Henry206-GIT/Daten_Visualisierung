"""Karten: Choropleth je Bundesland."""
import plotly.express as px
import streamlit as st

import components as C

st.set_page_config(page_title="Karten", page_icon="🗺️", layout="wide")
C.header("🗺️ Karten", "Wahlbeteiligung & Parteianteile je Bundesland")

df = C.load()
geo = C.load_geo()
if not geo:
    st.error("GeoJSON fehlt – ingest/run_all.py ausführen.")
    st.stop()

land = df[df.region_typ == "land"]
jahr = st.select_slider("Jahr", options=[2021, 2025], value=2025)

parteien = sorted(C.sel(land, indikator="stimmenanteil").gruppe.unique())
parteien = [p for p in C.HAUPTPARTEIEN if p in parteien] + \
           [p for p in parteien if p not in C.HAUPTPARTEIEN]
auswahl = st.selectbox("Indikator", ["Wahlbeteiligung"] +
                       [f"Stimmenanteil: {p}" for p in parteien])

if auswahl == "Wahlbeteiligung":
    sub = C.sel(land, indikator="wahlbeteiligung", jahr=jahr)
    label, scale = "Beteiligung %", "Blues"
else:
    partei = auswahl.split(": ", 1)[1]
    sub = C.sel(land, indikator="stimmenanteil", jahr=jahr, gruppe=partei)
    label, scale = f"{partei} Zweitst. %", "Viridis"

if sub.empty:
    st.warning("Keine Daten für diese Auswahl.")
else:
    fig = px.choropleth(
        sub, geojson=geo, locations="region", featureidkey="properties.name",
        color="wert", color_continuous_scale=scale,
        labels={"wert": label}, hover_name="region",
    )
    fig.update_geos(fitbounds="locations", visible=False)
    fig.update_layout(height=620, margin=dict(l=0, r=0, t=10, b=0),
                      coloraxis_colorbar_title=label)
    st.plotly_chart(fig, width='stretch')

    st.dataframe(
        sub[["region", "wert"]].sort_values("wert", ascending=False)
        .rename(columns={"region": "Bundesland", "wert": label}),
        width='stretch', hide_index=True,
    )
