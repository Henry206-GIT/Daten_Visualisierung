"""Korrelation / dichte Übersicht: Beteiligung vs. Parteien je Bundesland."""
import plotly.express as px
import streamlit as st

import components as C

st.set_page_config(page_title="Korrelation", page_icon="🔀", layout="wide")
C.header("🔀 Korrelation & dichte Übersicht",
         "Wahlbeteiligung vs. Parteianteile über die 16 Bundesländer (BTW 2025)")

df = C.load()
land = df[df.region_typ == "land"]
jahr = 2025

# wide-Tabelle: Zeile=Bundesland, Spalten=Beteiligung + Parteianteile
bet = C.sel(land, indikator="wahlbeteiligung", jahr=jahr)[["region", "wert"]] \
    .rename(columns={"wert": "Wahlbeteiligung"})
parts = C.sel(land, indikator="stimmenanteil", jahr=jahr)
parts = parts[parts.gruppe.isin(C.HAUPTPARTEIEN)]
wide = parts.pivot_table(index="region", columns="gruppe", values="wert").reset_index()
wide = wide.merge(bet, on="region")

metriken = [c for c in wide.columns if c != "region"]

st.subheader("Streudiagramm: zwei Indikatoren je Bundesland")
c1, c2 = st.columns(2)
x = c1.selectbox("X-Achse", metriken, index=metriken.index("Wahlbeteiligung"))
y = c2.selectbox("Y-Achse", metriken,
                 index=metriken.index("AfD") if "AfD" in metriken else 0)
fig = px.scatter(wide, x=x, y=y, text="region", trendline="ols",
                 labels={x: f"{x} %", y: f"{y} %"})
fig.update_traces(textposition="top center")
fig.update_layout(height=520)
st.plotly_chart(fig, width='stretch')

st.divider()
st.subheader("Korrelations-Heatmap (alle Indikatoren)")
corr = wide[metriken].corr().round(2)
fig2 = px.imshow(corr, text_auto=True, color_continuous_scale="RdBu", zmin=-1, zmax=1,
                 aspect="auto")
st.plotly_chart(fig2, width='stretch')
st.caption("Pearson-Korrelation über 16 Bundesländer. Rot = positiv, Blau = negativ.")

st.divider()
st.subheader("Dichte-Panel: Parteianteile je Bundesland")
long = wide.melt(id_vars="region", value_vars=[m for m in metriken
                 if m != "Wahlbeteiligung"], var_name="Partei", value_name="Anteil")
fig3 = px.bar(long, x="Anteil", y="region", color="Partei", orientation="h",
              labels={"region": "Bundesland", "Anteil": "Zweitstimmen %"})
fig3.update_layout(height=650, barmode="stack")
st.plotly_chart(fig3, width='stretch')
