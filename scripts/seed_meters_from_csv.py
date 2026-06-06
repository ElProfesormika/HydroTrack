#!/usr/bin/env python3
"""Alimente les 22 compteurs reseau depuis les CSV avec les vraies dates Horodatage."""

from __future__ import annotations

import argparse
import csv
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.models import MeterDataIn  # noqa: E402
from app.network_config import (  # noqa: E402
    DEFAULT_DISTRIBUTION_METERS,
    DEFAULT_DISTRIBUTION_WEIGHTS,
    NETWORK_METER_IDS,
    SEP_COLUMN_TO_METER,
)
from app.services import InMemoryStore  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Seed HydroTrack meters from CSV")
    parser.add_argument(
        "--csv",
        default=str(ROOT / "Donnee_compteur_SEP.csv"),
        help="Chemin du CSV compteurs (SEP ou JPD)",
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Efface les telemetries compteurs existantes avant import",
    )
    parser.add_argument(
        "--max-points",
        type=int,
        default=0,
        help="Limite de points injectes (0 = tout le fichier)",
    )
    return parser.parse_args()


def try_parse_datetime(value: str) -> datetime | None:
    raw = (value or "").strip().strip('"')
    if not raw:
        return None
    for fmt in ("%d/%m/%Y %H:%M", "%d/%m/%Y %H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(raw, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            pass
    return None


def coerce_float(value: Any) -> float | None:
    text = str(value).strip().strip('"').replace(",", ".")
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def detect_reader(csv_path: Path) -> tuple[csv.DictReader, Any]:
    raw = csv_path.read_text(encoding="utf-8", errors="replace")
    delimiter = "\t" if raw.count("\t") > raw.count(";") else ";"
    lines = raw.splitlines()
    reader = csv.DictReader(lines, delimiter=delimiter)
    return reader, delimiter


def seed_from_csv(csv_path: Path, reset: bool, max_points: int) -> dict[str, int]:
    store = InMemoryStore()
    if reset:
        store.sqlite.clear_meter_telemetry()

    reader, _ = detect_reader(csv_path)
    if not reader.fieldnames:
        raise ValueError("CSV vide ou en-tete introuvable")

    datetime_col = next(
        (c for c in reader.fieldnames if c and ("horodatage" in c.lower() or "date" in c.lower())),
        reader.fieldnames[0],
    )
    value_cols = [
        c
        for c in reader.fieldnames
        if c
        and c != datetime_col
        and "qualite" not in c.lower()
        and "_qualite" not in c.lower()
    ]

    mapped_cols = [c for c in value_cols if c in SEP_COLUMN_TO_METER]
    if not mapped_cols:
        mapped_cols = value_cols[: len(SEP_COLUMN_TO_METER)]

    source_prev: dict[str, float] = {}
    target_volume: dict[str, float] = {mid: 0.0 for mid in NETWORK_METER_IDS}
    prev_ts: datetime | None = None
    inserted = 0
    skipped_rows = 0
    weight_sum = sum(DEFAULT_DISTRIBUTION_WEIGHTS) or 1.0

    for row in reader:
        if max_points and inserted >= max_points:
            break

        timestamp = try_parse_datetime(row.get(datetime_col, ""))
        if timestamp is None:
            skipped_rows += 1
            continue

        hours = 168.0
        if prev_ts is not None:
            # Minimum 1 h entre releves pour eviter des debits aberrants (m3/h = deltaV / dt)
            hours = max((timestamp - prev_ts).total_seconds() / 3600.0, 1.0)
        prev_ts = timestamp

        row_deltas: list[tuple[str, float]] = []
        for col in mapped_cols:
            value = coerce_float(row.get(col))
            if value is None:
                continue
            prev = source_prev.get(col)
            source_prev[col] = value
            if prev is None:
                continue
            delta = max(0.0, value - prev)
            if delta <= 0:
                continue
            meter_id = SEP_COLUMN_TO_METER.get(col)
            if meter_id:
                row_deltas.append((meter_id, delta))

        if not row_deltas:
            skipped_rows += 1
            continue

        total_delta = sum(delta for _, delta in row_deltas)

        payloads: list[MeterDataIn] = []
        for meter_id, delta in row_deltas:
            target_volume[meter_id] += delta
            payloads.append(
                MeterDataIn(
                    timestamp=timestamp,
                    meter_id=meter_id,
                    volume=round(target_volume[meter_id], 4),
                    flow_rate=round(min(delta / hours, 2000.0), 4),
                )
            )

        for idx, meter_id in enumerate(DEFAULT_DISTRIBUTION_METERS):
            share = total_delta * (DEFAULT_DISTRIBUTION_WEIGHTS[idx] / weight_sum)
            if share <= 0:
                continue
            target_volume[meter_id] += share
            payloads.append(
                MeterDataIn(
                    timestamp=timestamp,
                    meter_id=meter_id,
                    volume=round(target_volume[meter_id], 4),
                    flow_rate=round(min(share / hours, 2000.0), 4),
                )
            )

        for payload in payloads:
            store.sqlite.insert_meter_data(payload)
            inserted += 1
            if max_points and inserted >= max_points:
                break

        if max_points and inserted >= max_points:
            break

    # ML : meme pipeline que les nouveaux releves (historique + dernier point)
    ml_scored = 0
    for meter_id in NETWORK_METER_IDS:
        history = store.sqlite.get_meter_flow_history(meter_id, limit=1)
        if not history:
            continue
        last = history[-1]
        payload = MeterDataIn(
            timestamp=datetime.fromisoformat(str(last["timestamp"]).replace("Z", "+00:00")),
            meter_id=meter_id,
            volume=float(last.get("volume") or 0.0),
            flow_rate=float(last["flow_rate"] or 0.0),
        )
        store._apply_ml_for_meter_point(payload)
        ml_scored += 1
    print(f"[info] compteurs scores ML (dernier releve): {ml_scored}")

    per_meter = store.sqlite._fetchall(
        f"""
        SELECT meter_id, COUNT(*) AS n, MIN(timestamp) AS first_ts, MAX(timestamp) AS last_ts
        FROM meter_data
        WHERE meter_id IN ({",".join("?" * len(NETWORK_METER_IDS))})
        GROUP BY meter_id
        ORDER BY meter_id
        """,
        tuple(NETWORK_METER_IDS),
    )

    return {
        "inserted": inserted,
        "skipped_rows": skipped_rows,
        "meters_with_data": len(per_meter),
        "expected_meters": len(NETWORK_METER_IDS),
    }


def main() -> None:
    args = parse_args()
    csv_path = Path(args.csv).resolve()
    if not csv_path.exists():
        raise FileNotFoundError(f"CSV introuvable: {csv_path}")

    stats = seed_from_csv(csv_path=csv_path, reset=args.reset, max_points=args.max_points)
    print(
        f"Import termine depuis {csv_path.name}: "
        f"{stats['inserted']} points, "
        f"{stats['meters_with_data']}/{stats['expected_meters']} compteurs alimentes, "
        f"{stats['skipped_rows']} lignes ignorees (date/valeur manquante)."
    )


if __name__ == "__main__":
    main()
