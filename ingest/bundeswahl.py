"""Bundeswahlleiterin kerg2.csv (BTW 2025, Langformat) -> tidy.

Liefert:
  - indikator='wahlbeteiligung' (Proxy fuer Politikverdrossenheit), je Bundesland+Bund
  - indikator='stimmenanteil' je Partei (Zweitstimme), je Bundesland+Bund
Jahre: 2025 (Prozent) und 2021 (VorpProzent), wenn vorhanden.
"""
import csv
import io
import sys
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import config  # noqa: E402

QUELLE = "Bundeswahlleiterin, BTW 2025 (kerg2)"
JAHR_AKT, JAHR_VORP = 2025, 2021
# nur grobe Ebenen: Bund + Land (Wahlkreise weglassen -> uebersichtlich)
GEBIET_TYP = {"Bund": "bund", "Land": "land"}


def _num(s):
    s = (s or "").strip().replace(".", "").replace(",", ".")
    if s == "":
        return None
    try:
        return float(s)
    except ValueError:
        return None


def fetch():
    r = requests.get(config.BUNDESWAHL_KERG2, timeout=60)
    r.raise_for_status()
    (config.RAW / "kerg2.csv").write_bytes(r.content)
    txt = r.content.decode("utf-8-sig", "replace")
    lines = txt.splitlines()
    # Header-Zeile finden (beginnt mit 'Wahlart;')
    start = next(i for i, l in enumerate(lines) if l.startswith("Wahlart;"))
    reader = csv.DictReader(io.StringIO("\n".join(lines[start:])), delimiter=";")

    rows = []
    for rec in reader:
        gart = rec.get("Gebietsart")
        if gart not in GEBIET_TYP:
            continue
        rtyp = GEBIET_TYP[gart]
        region = rec.get("Gebietsname") or ""
        if region == "Bundesgebiet":
            region = "Deutschland"
        gruppenart = rec.get("Gruppenart")
        gruppenname = (rec.get("Gruppenname") or "").strip()
        stimme = rec.get("Stimme")
        akt, vorp = _num(rec.get("Prozent")), _num(rec.get("VorpProzent"))

        # Wahlbeteiligung
        if gruppenname == "Wählende":
            for jahr, wert in ((JAHR_AKT, akt), (JAHR_VORP, vorp)):
                if wert is not None:
                    rows.append(_row("wahlbeteiligung", jahr, region, rtyp,
                                     "gesamt", "gesamt", wert))
            continue
        # Parteien: Zweitstimme (Stimme=2)
        if gruppenart == "Partei" and stimme == "2":
            for jahr, wert in ((JAHR_AKT, akt), (JAHR_VORP, vorp)):
                if wert is not None:
                    rows.append(_row("stimmenanteil", jahr, region, rtyp,
                                     gruppenname, "partei", wert))
    return rows


def _row(indikator, jahr, region, rtyp, gruppe, gruppe_typ, wert):
    return {
        "indikator": indikator,
        "jahr": jahr,
        "region": region,
        "region_typ": rtyp,
        "gruppe": gruppe,
        "gruppe_typ": gruppe_typ,
        "wert": round(float(wert), 3),
        "einheit": "%",
        "quelle": QUELLE,
    }
