"""Zeitreihen: Vertrauen & Wahlbeteiligung über die Jahre."""
import plotly.express as px
import streamlit as st

import components as C

st.set_page_config(page_title="Zeitreihen", page_icon="📈", layout="wide")
C.header("📈 Zeitreihen", "Entwicklung über die Jahre")

df = C.load()

st.subheader("Allgemeines Vertrauen (Eurostat, Skala 0-10)")
trust = C.sel(df, indikator="vertrauen_allgemein")
typ = st.radio("Aufschlüsselung", ["gesamt", "geschlecht", "alter", "bildung"],
               horizontal=True)
sub = trust[trust.gruppe_typ == typ]
if sub.empty:
    st.warning("Keine Daten für diese Auswahl.")
else:
    fig = px.line(sub.sort_values("jahr"), x="jahr", y="wert", color="gruppe",
                  markers=True, labels={"wert": "Vertrauen (0-10)", "jahr": "Jahr",
                                        "gruppe": "Gruppe"})
    fig.update_layout(yaxis_range=[4, 7], hovermode="x unified")
    st.plotly_chart(fig, width='stretch')

st.divider()
st.subheader("Wahlbeteiligung (Proxy Politikverdrossenheit) – BTW 2021 vs. 2025")
tb = C.sel(df, indikator="wahlbeteiligung")
laender = sorted(tb[tb.region_typ == "land"].region.unique())
pick = st.multiselect("Regionen", ["Deutschland"] + laender,
                      default=["Deutschland"])
sub2 = tb[tb.region.isin(pick)]
if sub2.empty:
    st.warning("Keine Region gewählt.")
else:
    fig2 = px.line(sub2.sort_values("jahr"), x="jahr", y="wert", color="region",
                   markers=True, labels={"wert": "Beteiligung %", "jahr": "Jahr"})
    fig2.update_xaxes(tickvals=[2021, 2025])
    st.plotly_chart(fig2, width='stretch')

st.divider()
st.subheader("Parteien – Zweitstimmenanteil 2021 vs. 2025 (Bund)")
p = C.sel(df, indikator="stimmenanteil", region="Deutschland")
p = p[p.gruppe.isin(C.HAUPTPARTEIEN)]
fig3 = px.line(p.sort_values("jahr"), x="jahr", y="wert", color="gruppe", markers=True,
               labels={"wert": "Zweitstimmen %", "jahr": "Jahr", "gruppe": "Partei"})
fig3.update_xaxes(tickvals=[2021, 2025])
st.plotly_chart(fig3, width='stretch')
