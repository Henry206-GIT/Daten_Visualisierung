"""Alle Ingest-Module ausfuehren, tidy CSV nach data/processed/ schreiben.

Best-effort: faellt eine Quelle aus, wird sie geloggt, der Rest laeuft weiter.
Re-Run ueberschreibt sauber. Nicht-auto-fetchbare Quellen werden am Ende gelistet.
"""
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import config  # noqa: E402
from ingest import eurostat, bundeswahl, geo  # noqa: E402

# bekannte, NICHT auto-fetchbare Quellen (Registrierungs-/Token-Wall)
GAPS = [
    "GESIS Politbarometer (institutionelles/Parteien-Vertrauen) -> Login, manueller Download",
    "GESIS ALLBUS (politische Einstellungen) -> Login, manueller Download",
    "Destatis GENESIS-Online (Wahlbeteiligung-Langzeitreihe, Demografie) -> kostenloser Token noetig",
]


def _write(name, rows):
    df = pd.DataFrame(rows, columns=config.SCHEMA)
    path = config.PROCESSED / f"{name}.csv"
    df.to_csv(path, index=False)
    print(f"  ✓ {name}.csv  ({len(df)} Zeilen)")
    return len(df)


def main():
    config.RAW.mkdir(parents=True, exist_ok=True)
    config.PROCESSED.mkdir(parents=True, exist_ok=True)
    print("Ingestion gestartet…\n")

    total = 0
    for name, mod in (("eurostat", eurostat), ("bundeswahl", bundeswahl)):
        try:
            rows = mod.fetch()
            total += _write(name, rows)
        except Exception as e:  # noqa: BLE001
            print(f"  ✗ {name} FEHLGESCHLAGEN: {e}")

    try:
        n = geo.fetch()
        print(f"  ✓ geo_bundeslaender.json  ({n} Features)")
    except Exception as e:  # noqa: BLE001
        print(f"  ✗ geo FEHLGESCHLAGEN: {e}")

    print(f"\nFertig. {total} tidy-Zeilen gesamt.")
    print("\nBekannte Daten-Luecken (nicht auto-fetchbar, Upgrade-Pfad):")
    for g in GAPS:
        print(f"  – {g}")


if __name__ == "__main__":
    main()
