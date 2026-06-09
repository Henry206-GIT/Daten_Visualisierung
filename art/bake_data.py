"""Backt data/processed/*.csv -> art/data.json (gemeinsamer Daten-Kontrakt).

Schema (data.json):
{
  "parteien": ["CDU", ...],                  # nach Bund-Anteil 2025 absteigend
  "farben":   {"CDU": "#e6e6e6", ...,        # kuratierte Palette (dunkler Grund)
               "Nichtwähler": "#5a5a5a"},
  "bund":   {"name","beteiligung","shares":{partei:pct}},
  "laender":[{"name","beteiligung","shares":{partei:pct}}, ...] # 16 Bundesländer
  "vertrauen":[{"jahr","wert"}, ...],        # allg. Vertrauen gesamt
  "vertrauen_alter":[{"jahr","gruppe","wert"}, ...]
}
"""
import json
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import config  # noqa: E402

# kuratierte Palette: Partei-Identität, aber für dunklen Grund optimiert
FARBEN = {
    "CDU": "#e6e6e6", "SPD": "#ff4d5e", "AfD": "#19b6e8", "GRÜNE": "#46d160",
    "FDP": "#ffe23d", "CSU": "#5a9bd8", "Die Linke": "#e0457b", "BSW": "#c061ff",
    "Nichtwähler": "#5a5a5a",
}
HAUPT = list(FARBEN.keys())[:8]


def shares(df, region):
    sub = df[(df.indikator == "stimmenanteil") & (df.region == region)
             & (df.jahr == 2025)]
    out = {}
    for _, r in sub.iterrows():
        if r.gruppe in HAUPT:
            out[r.gruppe] = round(float(r.wert), 2)
    return out


def beteiligung(df, region):
    sub = df[(df.indikator == "wahlbeteiligung") & (df.region == region)
             & (df.jahr == 2025)]
    return round(float(sub.iloc[0].wert), 2) if len(sub) else None


def votes_from_kerg2():
    """Absolute Zweitstimmen je Region+Partei aus Roh-kerg2 (Anzahl, Stimme==2)."""
    import csv
    import io
    raw = config.RAW / "kerg2.csv"
    txt = raw.read_text(encoding="utf-8-sig")
    lines = txt.splitlines()
    start = next(i for i, l in enumerate(lines) if l.startswith("Wahlart;"))
    reader = csv.DictReader(io.StringIO("\n".join(lines[start:])), delimiter=";")
    out = {}   # region -> {party: votes}
    for rec in reader:
        if rec.get("Gebietsart") not in ("Bund", "Land"):
            continue
        if rec.get("Gruppenart") != "Partei" or rec.get("Stimme") != "2":
            continue
        party = (rec.get("Gruppenname") or "").strip()
        if party not in HAUPT:
            continue
        region = rec.get("Gebietsname") or ""
        if region == "Bundesgebiet":
            region = "Deutschland"
        try:
            n = int((rec.get("Anzahl") or "").strip())
        except ValueError:
            continue
        out.setdefault(region, {})[party] = n
    return out


def main():
    df = pd.concat(
        [pd.read_csv(p) for p in sorted(config.PROCESSED.glob("*.csv"))],
        ignore_index=True,
    )

    bund_shares = shares(df, "Deutschland")
    parteien = sorted(bund_shares, key=lambda p: -bund_shares[p])
    votes = votes_from_kerg2()

    laender = []
    land_df = df[df.region_typ == "land"]
    for name in sorted(land_df.region.unique()):
        laender.append({
            "name": name,
            "beteiligung": beteiligung(df, name),
            "shares": shares(df, name),
            "votes": votes.get(name, {}),
        })

    vt = df[(df.indikator == "vertrauen_allgemein") & (df.gruppe == "gesamt")]
    vertrauen = [{"jahr": int(r.jahr), "wert": float(r.wert)}
                 for _, r in vt.sort_values("jahr").iterrows()]

    va = df[(df.indikator == "vertrauen_allgemein") & (df.gruppe_typ == "alter")]
    vertrauen_alter = [{"jahr": int(r.jahr), "gruppe": r.gruppe, "wert": float(r.wert)}
                       for _, r in va.sort_values(["jahr", "gruppe"]).iterrows()]

    data = {
        "parteien": parteien,
        "farben": FARBEN,
        "bund": {"name": "Deutschland",
                 "beteiligung": beteiligung(df, "Deutschland"),
                 "shares": bund_shares,
                 "votes": votes.get("Deutschland", {})},
        "laender": laender,
        "vertrauen": vertrauen,
        "vertrauen_alter": vertrauen_alter,
    }

    out = Path(__file__).resolve().parent / "data.json"
    out.write_text(json.dumps(data, ensure_ascii=False, indent=2))
    print(f"✓ {out}  ({out.stat().st_size} bytes)")
    print(f"  Parteien: {parteien}")
    print(f"  Länder: {len(laender)}  Vertrauen-Jahre: {len(vertrauen)}")


if __name__ == "__main__":
    main()
