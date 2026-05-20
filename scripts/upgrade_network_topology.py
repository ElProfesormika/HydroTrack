#!/usr/bin/env python3
"""Met a jour le registre SQLite avec la topologie 10 km / ~300 m (33 zones, 66 capteurs)."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.admin_store import AdminStore  # noqa: E402
from app.persistence import SQLiteStore  # noqa: E402
from app.registry import NetworkRegistry  # noqa: E402
from app import network_topology  # noqa: E402


def main() -> None:
    db = ROOT / "backend" / "data" / "hydrotrack.db"
    registry = NetworkRegistry()
    store = SQLiteStore(db)
    admin = AdminStore(store, registry)
    admin.sync_topology_from_defaults()
    admin.reload_registry()
    print(
        f"Topologie v{network_topology.TOPOLOGY_VERSION}: "
        f"{network_topology.ZONE_COUNT} zones, {network_topology.SENSOR_COUNT} capteurs, "
        f"~{int(network_topology.NETWORK_TOTAL_LENGTH_M)} m"
    )


if __name__ == "__main__":
    main()
