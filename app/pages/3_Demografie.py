"""Demografie: Vertrauen nach Alter, Bildung, Geschlecht."""
import plotly.express as px
import streamlit as st

import components as C

st.set_page_config(page_title="Demografie", page_icon="👥", layout="wide")
C.header("👥 Demografie", "Allgemeines Vertrauen nach Bevölkerungsgruppen (Eurostat)")

df = C.load()
trust = C.sel(df, indikator="vertrauen_allgemein")

jahre = sorted(trust.jahr.unique())
jahr = st.select_slider("Jahr", options=jahre, value=max(jahre))

c1, c2, c3 = st.columns(3)
for col, typ, titel in ((c1, "alter", "Alter"), (c2, "bildung", "Bildung"),
                        (c3, "geschlecht", "Geschlecht")):
    sub = trust[(trust.gruppe_typ == typ) & (trust.jahr == jahr)].sort_values("gruppe")
    with col:
        st.markdown(f"**Nach {titel}**")
        if sub.empty:
            st.caption("keine Daten")
            continue
        fig = px.bar(sub, x="gruppe", y="wert", color="wert",
                     color_continuous_scale="Tealgrn", range_y=[0, 8],
                     labels={"wert": "Vertrauen", "gruppe": titel})
        fig.update_layout(showlegend=False, coloraxis_showscale=False,
                          margin=dict(t=10, b=0))
        st.plotly_chart(fig, width='stretch')

st.divider()
st.subheader("Heatmap: Altersgruppe × Jahr")
hm = trust[trust.gruppe_typ == "alter"]
if not hm.empty:
    piv = hm.pivot_table(index="gruppe", columns="jahr", values="wert")
    fig = px.imshow(piv, text_auto=".1f", color_continuous_scale="Tealgrn",
                    aspect="auto", labels=dict(color="Vertrauen", x="Jahr",
                                               y="Altersgruppe"))
    st.plotly_chart(fig, width='stretch')
