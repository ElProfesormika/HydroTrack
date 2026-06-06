from __future__ import annotations

import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

from app.meter_flow import flow_rate_from_index, parse_ts
from app.ml import MeterAnomalyEngine, flow_rate_to_daily_consumption
from app.models import MeterDataIn, MeterReadingIn
from app.persistence import SQLiteStore
from app.registry import NetworkRegistry
from app.services import InMemoryStore


def test_daily_consumption_matches_notebook_units() -> None:
    assert flow_rate_to_daily_consumption(1.0) == 24.0


def test_bootstrap_then_score_new_point() -> None:
    engine = MeterAnomalyEngine(window_size=50)
    rates = [0.1 + 0.01 * i for i in range(25)]
    engine.bootstrap_from_flow_rates("M01", rates)
    score, prob = engine.score("M01", rates[-1] * 5)
    assert score >= 0.0
    assert prob >= 0.0


def test_flow_rate_from_index_first_reading_is_zero() -> None:
    ts = datetime(2024, 6, 1, tzinfo=timezone.utc)
    assert flow_rate_from_index(100.0, ts, None) == 0.0


def test_flow_rate_from_index_daily_equivalent() -> None:
    t0 = datetime(2024, 1, 1, tzinfo=timezone.utc)
    t1 = t0 + timedelta(days=1)
    prev = {"volume": 100.0, "timestamp": t0.isoformat()}
    flow_m3h = flow_rate_from_index(110.0, t1, prev)
    assert abs(flow_rate_to_daily_consumption(flow_m3h) - 10.0) < 0.01


def test_flow_history_returns_recent_window() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        db = Path(tmp) / "test.db"
        store = SQLiteStore(db)
        meter_id = "AMPERE_1"
        base = datetime(2020, 1, 1, tzinfo=timezone.utc)
        for i in range(30):
            ts = base + timedelta(days=i)
            store.insert_meter_data(
                MeterDataIn(
                    timestamp=ts,
                    meter_id=meter_id,
                    volume=100.0 + i,
                    flow_rate=float(i),
                )
            )
        history = store.get_meter_flow_history(meter_id, limit=5)
        assert len(history) == 5
        assert parse_ts(history[0]["timestamp"]) == base + timedelta(days=25)
        assert parse_ts(history[-1]["timestamp"]) == base + timedelta(days=29)


def test_out_of_order_reading_recalculates_and_scores() -> None:
    from collections import deque

    from app.admin_store import AdminStore

    with tempfile.TemporaryDirectory() as tmp:
        db_path = Path(tmp) / "hydrotrack.db"
        sqlite = SQLiteStore(db_path)
        registry = NetworkRegistry()
        AdminStore(sqlite, registry)

        store = object.__new__(InMemoryStore)
        store.meter_data = deque(maxlen=100)
        store.pressure_data = deque(maxlen=100)
        store.anomalies = deque(maxlen=500)
        store.alerts = deque(maxlen=500)
        store.pending_meter_suspicions = {}
        store.ml_engine = MeterAnomalyEngine()
        store.sqlite = sqlite
        store.registry = registry
        store.admin = AdminStore(sqlite, registry)

        meter_id = "AMPERE_1"
        t1 = datetime(2024, 1, 1, tzinfo=timezone.utc)
        t2 = datetime(2024, 1, 10, tzinfo=timezone.utc)
        t_mid = datetime(2024, 1, 5, tzinfo=timezone.utc)

        store.create_meter_reading(
            MeterReadingIn(timestamp=t1, meter_id=meter_id, volume=100.0, notes="")
        )
        store.create_meter_reading(
            MeterReadingIn(timestamp=t2, meter_id=meter_id, volume=200.0, notes="")
        )
        store.create_meter_reading(
            MeterReadingIn(timestamp=t_mid, meter_id=meter_id, volume=150.0, notes="")
        )

        rows = sqlite.list_meter_data_chronological(meter_id)
        assert len(rows) == 3
        assert parse_ts(rows[1]["timestamp"]) == t_mid
        assert float(rows[1]["flow_rate"]) > 0

        anomalies = sqlite.get_latest_anomalies(limit=10)
        assert any(a["meter_id"] == meter_id for a in anomalies)
