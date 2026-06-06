#!/usr/bin/env python3
"""Supprime les doublons ML (alertes « levee legere », anomalies repetees)."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.persistence import SQLiteStore  # noqa: E402


def main() -> None:
    db = ROOT / "backend" / "data" / "hydrotrack.db"
    store = SQLiteStore(db)
    stats = store.cleanup_ml_warmup_duplicates()
    print(
        f"Nettoyage termine : {stats['alerts_removed']} alertes, "
        f"{stats['anomalies_removed']} anomalies supprimees."
    )


if __name__ == "__main__":
    main()
