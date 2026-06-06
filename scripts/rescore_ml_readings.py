#!/usr/bin/env python3
"""Recalcule scores ML et alertes pour releves manuels et anomalies a 0 %."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.meter_flow import parse_ts  # noqa: E402
from app.models import MeterDataIn  # noqa: E402
from app.persistence import SQLiteStore  # noqa: E402
from app.services import InMemoryStore  # noqa: E402


def main() -> None:
    store = InMemoryStore(max_items=500)
    rescored = 0

    seen: set[tuple[str, str]] = set()
    for row in store.sqlite.list_manual_readings_for_ml():
        meter_id = str(row["meter_id"])
        ts = parse_ts(row["timestamp"])
        key = (meter_id, ts.isoformat())
        if key in seen:
            continue
        seen.add(key)
        flow = float(row.get("flow_rate") or 0.0)
        if row.get("meter_data_id"):
            md = store.sqlite.get_meter_data_row(int(row["meter_data_id"]))
            if md:
                flow = float(md.get("flow_rate") or flow)
        payload = MeterDataIn(
            timestamp=ts,
            meter_id=meter_id,
            volume=float(row.get("volume") or 0.0),
            flow_rate=flow,
        )
        result = store._apply_ml_for_meter_point(payload)
        print(
            f"{meter_id} {ts.isoformat()[:19]} -> "
            f"score={result['anomaly_score']} prob={result['leak_probability']:.0%}"
        )
        rescored += 1

    for row in store.sqlite.list_zero_ml_anomalies(limit=2000):
        meter_id = str(row["meter_id"])
        ts = parse_ts(row["timestamp"])
        key = (meter_id, ts.isoformat())
        if key in seen:
            continue
        md = store.sqlite.get_meter_data_at_timestamp(meter_id, ts.isoformat())
        if not md:
            continue
        seen.add(key)
        payload = MeterDataIn(
            timestamp=ts,
            meter_id=meter_id,
            volume=float(md.get("volume") or 0.0),
            flow_rate=float(md.get("flow_rate") or 0.0),
        )
        result = store._apply_ml_for_meter_point(payload)
        if result["leak_probability"] > 0 or result["anomaly_score"] > 0:
            print(
                f"[fix] {meter_id} {ts.isoformat()[:19]} -> "
                f"score={result['anomaly_score']} prob={result['leak_probability']:.0%}"
            )
        rescored += 1

    print(f"Termine : {rescored} releve(s) re-scores.")


if __name__ == "__main__":
    main()
