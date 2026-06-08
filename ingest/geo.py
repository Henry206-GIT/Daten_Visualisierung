"""Bundesland-GeoJSON laden und lokal cachen (fuer Choropleth-Karten)."""
import sys
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import config  # noqa: E402

OUT = "geo_bundeslaender.json"


def fetch():
    r = requests.get(config.GEOJSON_LAENDER, timeout=60)
    r.raise_for_status()
    (config.PROCESSED / OUT).write_bytes(r.content)
    gj = r.json()
    return len(gj.get("features", []))
