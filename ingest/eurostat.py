"""Eurostat ilc_pw03 -> allgemeines Vertrauen (Skala 0-10), DE.

Liefert tidy Long-Zeilen: indikator='vertrauen_allgemein', mit demografischen
Gruppen (Alter/Geschlecht/Bildung) ueber die Jahre 2013-2025.
JSON-stat 2.0 Format wird generisch dekodiert.
"""
import sys
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import config  # noqa: E402

QUELLE = "Eurostat ilc_pw03 (allgemeines Vertrauen)"

# Eurostat-Codes -> lesbare Gruppe + gruppe_typ
SEX = {"M": ("Männer", "geschlecht"), "F": ("Frauen", "geschlecht")}
EDU = {
    "ED0-2": ("Niedrig (ISCED 0-2)", "bildung"),
    "ED3_4": ("Mittel (ISCED 3-4)", "bildung"),
    "ED5_6": ("Hoch (ISCED 5-6)", "bildung"),
}
AGE = {
    "Y16-24": ("16-24", "alter"),
    "Y25-34": ("25-34", "alter"),
    "Y35-49": ("35-49", "alter"),
    "Y50-64": ("50-64", "alter"),
    "Y65-74": ("65-74", "alter"),
    "Y_GE75": ("75+", "alter"),
}


def _decode_jsonstat(d):
    """JSON-stat 2.0 -> Liste von (coords-dict, wert)."""
    ids = d["id"]
    size = d["size"]
    # index-position je Dimension/Kategorie
    cat_index = {}
    for dim in ids:
        idx = d["dimension"][dim]["category"]["index"]
        # idx kann dict {code:pos} oder liste sein
        if isinstance(idx, dict):
            pos2code = {v: k for k, v in idx.items()}
        else:
            pos2code = {i: c for i, c in enumerate(idx)}
        cat_index[dim] = pos2code
    # strides (row-major)
    strides = [1] * len(size)
    for i in range(len(size) - 2, -1, -1):
        strides[i] = strides[i + 1] * size[i + 1]
    out = []
    for flat_str, val in d["value"].items():
        flat = int(flat_str)
        coords = {}
        for i, dim in enumerate(ids):
            pos = (flat // strides[i]) % size[i]
            coords[dim] = cat_index[dim][pos]
        out.append((coords, val))
    return out


def fetch():
    url = f"{config.EUROSTAT_BASE}/{config.EUROSTAT_TRUST}?format=JSON&geo=DE&lang=EN"
    r = requests.get(url, timeout=60)
    r.raise_for_status()
    (config.RAW / "eurostat_ilc_pw03.json").write_bytes(r.content)
    rows = []
    for coords, val in _decode_jsonstat(r.json()):
        jahr = int(coords["time"])
        sex, age, edu = coords["sex"], coords["age"], coords["isced11"]
        # Gesamt = Total/Total/Total
        if sex == "T" and age == "Y_GE16" and edu == "TOTAL":
            rows.append(_row(jahr, "gesamt", "gesamt", val))
            continue
        # Geschlecht (Gesamtalter+bildung)
        if sex in SEX and age == "Y_GE16" and edu == "TOTAL":
            g, gt = SEX[sex]
            rows.append(_row(jahr, g, gt, val))
            continue
        # Bildung (Gesamtalter+geschlecht)
        if edu in EDU and sex == "T" and age == "Y_GE16":
            g, gt = EDU[edu]
            rows.append(_row(jahr, g, gt, val))
            continue
        # Alter (Gesamtbildung+geschlecht)
        if age in AGE and sex == "T" and edu == "TOTAL":
            g, gt = AGE[age]
            rows.append(_row(jahr, g, gt, val))
            continue
    return rows


def _row(jahr, gruppe, gruppe_typ, wert):
    return {
        "indikator": "vertrauen_allgemein",
        "jahr": jahr,
        "region": "Deutschland",
        "region_typ": "bund",
        "gruppe": gruppe,
        "gruppe_typ": gruppe_typ,
        "wert": round(float(wert), 3),
        "einheit": "Skala 0-10",
        "quelle": QUELLE,
    }
