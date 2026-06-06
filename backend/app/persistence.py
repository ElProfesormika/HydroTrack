from __future__ import annotations

import sqlite3
import statistics
import threading
from collections import defaultdict
from pathlib import Path
from typing import Any

from .models import Alert, Anomaly, MeterDataIn, PressureDataIn
from .network_config import MAX_FLOW_RATE_M3H_KPI, NETWORK_METER_IDS, SEP_METER_IDS


class SQLiteStore:
    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(self.db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._lock = threading.RLock()
        self._active_meter_ids: list[str] = list(NETWORK_METER_IDS)
        self._create_tables()

    def set_active_meter_ids(self, meter_ids: list[str]) -> None:
        self._active_meter_ids = meter_ids or list(NETWORK_METER_IDS)

    def _execute_commit(self, sql: str, params: tuple[Any, ...]) -> None:
        with self._lock:
            self._conn.execute(sql, params)
            self._conn.commit()

    def _fetchall(self, sql: str, params: tuple[Any, ...] = ()) -> list[sqlite3.Row]:
        with self._lock:
            return self._conn.execute(sql, params).fetchall()

    def _fetchone(self, sql: str, params: tuple[Any, ...] = ()) -> sqlite3.Row:
        with self._lock:
            return self._conn.execute(sql, params).fetchone()

    def _meter_filter_sql(self) -> tuple[str, list[str]]:
        ids = self._active_meter_ids or list(NETWORK_METER_IDS)
        if not ids:
            return "1=0", []
        placeholders = ",".join("?" * len(ids))
        return f"meter_id IN ({placeholders})", list(ids)

    def _create_tables(self) -> None:
        with self._lock:
            self._conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS meter_data (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    meter_id TEXT NOT NULL,
                    volume REAL NOT NULL,
                    flow_rate REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS pressure_data (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    sensor_id TEXT NOT NULL,
                    zone TEXT NOT NULL,
                    pressure_signal REAL NOT NULL,
                    frequency REAL NOT NULL,
                    intensity REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS anomalies (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    meter_id TEXT NOT NULL,
                    score REAL NOT NULL,
                    leak_probability REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS alerts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    severity TEXT NOT NULL,
                    category TEXT NOT NULL,
                    source_id TEXT NOT NULL,
                    message TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS manual_meter_readings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    meter_id TEXT NOT NULL,
                    volume REAL NOT NULL,
                    flow_rate REAL NOT NULL,
                    notes TEXT,
                    meter_data_id INTEGER,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS leak_localizations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    zone_id INTEGER NOT NULL,
                    segment_id TEXT NOT NULL,
                    upstream_meter TEXT,
                    downstream_meter TEXT,
                    confirmed INTEGER NOT NULL,
                    confirmation_confidence REAL NOT NULL,
                    distance_m_from_upstream REAL,
                    segment_length_m REAL,
                    position_ratio REAL,
                    localization_confidence REAL,
                    plan_x REAL,
                    plan_y REAL,
                    pressure_leak_score REAL,
                    sensor_correlation REAL,
                    trigger_sensor_id TEXT,
                    meter_source TEXT,
                    wave_speed_m_s REAL,
                    delta_t_s REAL,
                    delta_t_method TEXT,
                    transient_score REAL,
                    pipe_material TEXT,
                    leak_radius_m REAL
                );
                """
            )
            for col_def in (
                "ALTER TABLE leak_localizations ADD COLUMN wave_speed_m_s REAL",
                "ALTER TABLE leak_localizations ADD COLUMN delta_t_s REAL",
                "ALTER TABLE leak_localizations ADD COLUMN delta_t_method TEXT",
                "ALTER TABLE leak_localizations ADD COLUMN transient_score REAL",
                "ALTER TABLE leak_localizations ADD COLUMN pipe_material TEXT",
                "ALTER TABLE leak_localizations ADD COLUMN leak_radius_m REAL",
            ):
                try:
                    self._conn.execute(col_def)
                except Exception:
                    pass
            self._conn.commit()

    def insert_meter_data(self, item: MeterDataIn) -> int:
        with self._lock:
            cur = self._conn.execute(
                """
                INSERT INTO meter_data(timestamp, meter_id, volume, flow_rate)
                VALUES (?, ?, ?, ?)
                """,
                (item.timestamp.isoformat(), item.meter_id, item.volume, item.flow_rate),
            )
            self._conn.commit()
            return int(cur.lastrowid)

    def update_meter_data(self, row_id: int, item: MeterDataIn) -> None:
        self._execute_commit(
            """
            UPDATE meter_data
            SET timestamp = ?, meter_id = ?, volume = ?, flow_rate = ?
            WHERE id = ?
            """,
            (item.timestamp.isoformat(), item.meter_id, item.volume, item.flow_rate, row_id),
        )

    def delete_meter_data(self, row_id: int) -> None:
        self._execute_commit("DELETE FROM meter_data WHERE id = ?", (row_id,))

    def get_meter_data_row(self, row_id: int) -> dict[str, Any] | None:
        row = self._fetchone(
            """
            SELECT id, timestamp, meter_id, volume, flow_rate
            FROM meter_data WHERE id = ?
            """,
            (row_id,),
        )
        return dict(row) if row else None

    def list_meter_data_chronological(self, meter_id: str) -> list[dict[str, Any]]:
        rows = self._fetchall(
            """
            SELECT id, timestamp, meter_id, volume, flow_rate
            FROM meter_data
            WHERE meter_id = ?
            ORDER BY datetime(timestamp) ASC, id ASC
            """,
            (meter_id,),
        )
        return [dict(r) for r in rows]

    def update_meter_data_flow(self, row_id: int, flow_rate: float) -> None:
        self._execute_commit(
            "UPDATE meter_data SET flow_rate = ? WHERE id = ?",
            (flow_rate, row_id),
        )

    def get_meter_flow_history_before(
        self,
        meter_id: str,
        before_timestamp: str,
        limit: int = 200,
        exclude_row_id: int | None = None,
    ) -> list[dict[str, Any]]:
        """Derniers releves strictement anterieurs a before_timestamp (ordre chronologique)."""
        params: list[Any] = [meter_id, before_timestamp]
        exclude_sql = ""
        if exclude_row_id is not None:
            exclude_sql = " AND id != ?"
            params.append(exclude_row_id)
        params.append(max(1, int(limit)))
        rows = self._fetchall(
            f"""
            SELECT id, timestamp, volume, flow_rate
            FROM (
                SELECT id, timestamp, volume, flow_rate
                FROM meter_data
                WHERE meter_id = ? AND datetime(timestamp) < datetime(?)
                {exclude_sql}
                ORDER BY datetime(timestamp) DESC, id DESC
                LIMIT ?
            )
            ORDER BY datetime(timestamp) ASC, id ASC
            """,
            tuple(params),
        )
        return [dict(r) for r in rows]

    def get_meter_data_at_timestamp(self, meter_id: str, timestamp: str) -> dict[str, Any] | None:
        row = self._fetchone(
            """
            SELECT id, timestamp, meter_id, volume, flow_rate
            FROM meter_data
            WHERE meter_id = ? AND timestamp = ?
            LIMIT 1
            """,
            (meter_id, timestamp),
        )
        if row:
            return dict(row)
        row = self._fetchone(
            """
            SELECT id, timestamp, meter_id, volume, flow_rate
            FROM meter_data
            WHERE meter_id = ? AND datetime(timestamp) = datetime(?)
            ORDER BY id DESC
            LIMIT 1
            """,
            (meter_id, timestamp),
        )
        return dict(row) if row else None

    def list_zero_ml_anomalies(self, limit: int = 500) -> list[dict[str, Any]]:
        rows = self._fetchall(
            """
            SELECT timestamp, meter_id, score, leak_probability
            FROM anomalies
            WHERE score = 0 AND leak_probability = 0
            ORDER BY id DESC
            LIMIT ?
            """,
            (max(1, int(limit)),),
        )
        return [dict(r) for r in rows]

    def list_manual_readings_for_ml(self) -> list[dict[str, Any]]:
        rows = self._fetchall(
            """
            SELECT id, timestamp, meter_id, volume, flow_rate, meter_data_id
            FROM manual_meter_readings
            ORDER BY meter_id ASC, datetime(timestamp) ASC, id ASC
            """
        )
        return [dict(r) for r in rows]

    def upsert_ml_alert(self, item: Alert) -> None:
        """Une alerte ML active par compteur et horodatage."""
        ts = item.timestamp.isoformat()
        with self._lock:
            self._conn.execute(
                """
                DELETE FROM alerts
                WHERE source_id = ? AND timestamp = ?
                  AND category IN ('anomaly', 'leak_suspected')
                """,
                (item.source_id, ts),
            )
            self._conn.execute(
                """
                INSERT INTO alerts(timestamp, severity, category, source_id, message)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    ts,
                    item.severity,
                    item.category,
                    item.source_id,
                    item.message,
                ),
            )
            self._conn.commit()

    def get_meter_flow_history(
        self,
        meter_id: str,
        limit: int = 200,
        exclude_row_id: int | None = None,
    ) -> list[dict[str, Any]]:
        """Derniers releves chronologiques (fenetre glissante) pour le ML."""
        params: list[Any] = [meter_id]
        exclude_sql = ""
        if exclude_row_id is not None:
            exclude_sql = " AND id != ?"
            params.append(exclude_row_id)
        params.append(max(1, int(limit)))
        rows = self._fetchall(
            f"""
            SELECT id, timestamp, volume, flow_rate
            FROM (
                SELECT id, timestamp, volume, flow_rate
                FROM meter_data
                WHERE meter_id = ?
                {exclude_sql}
                ORDER BY datetime(timestamp) DESC, id DESC
                LIMIT ?
            )
            ORDER BY datetime(timestamp) ASC, id ASC
            """,
            tuple(params),
        )
        return [dict(r) for r in rows]

    def get_previous_meter_index(
        self,
        meter_id: str,
        before_timestamp: str,
        exclude_row_id: int | None = None,
    ) -> dict[str, Any] | None:
        """Dernier index compteur (volume) strictement anterieur a before_timestamp."""
        params: list[Any] = [meter_id, before_timestamp]
        exclude_sql = ""
        if exclude_row_id is not None:
            exclude_sql = " AND id != ?"
            params.append(exclude_row_id)
        row = self._fetchone(
            f"""
            SELECT id, timestamp, volume, flow_rate
            FROM meter_data
            WHERE meter_id = ? AND datetime(timestamp) < datetime(?)
            {exclude_sql}
            ORDER BY datetime(timestamp) DESC, id DESC
            LIMIT 1
            """,
            tuple(params),
        )
        return dict(row) if row else None

    def insert_pressure_data(self, item: PressureDataIn) -> None:
        self._execute_commit(
            """
            INSERT INTO pressure_data(
                timestamp, sensor_id, zone, pressure_signal, frequency, intensity
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                item.timestamp.isoformat(),
                item.sensor_id,
                item.zone,
                item.pressure_signal,
                item.frequency,
                item.intensity,
            ),
        )

    def delete_orphan_anomalies(self) -> int:
        """Supprime anomalies sans releve meter_data correspondant."""
        with self._lock:
            cur = self._conn.execute(
                """
                DELETE FROM anomalies
                WHERE NOT EXISTS (
                    SELECT 1 FROM meter_data md
                    WHERE md.meter_id = anomalies.meter_id
                      AND datetime(md.timestamp) = datetime(anomalies.timestamp)
                )
                """
            )
            self._conn.commit()
        return int(cur.rowcount)

    def upsert_anomaly(self, item: Anomaly) -> None:
        """Un seul enregistrement ML par compteur et horodatage de releve."""
        ts = item.timestamp.isoformat()
        with self._lock:
            self._conn.execute(
                """
                DELETE FROM anomalies
                WHERE meter_id = ? AND datetime(timestamp) = datetime(?)
                """,
                (item.meter_id, ts),
            )
            self._conn.execute(
                """
                INSERT INTO anomalies(timestamp, meter_id, score, leak_probability)
                VALUES (?, ?, ?, ?)
                """,
                (ts, item.meter_id, item.score, item.leak_probability),
            )
            self._conn.commit()

    def insert_anomaly(self, item: Anomaly) -> None:
        self.upsert_anomaly(item)

    def dedupe_anomalies(self) -> int:
        """Garde une seule anomalie par (compteur, horodatage)."""
        with self._lock:
            cur = self._conn.execute(
                """
                DELETE FROM anomalies
                WHERE id NOT IN (
                    SELECT MAX(id)
                    FROM anomalies
                    GROUP BY meter_id, timestamp
                )
                """
            )
            self._conn.commit()
        return int(cur.rowcount)

    def cleanup_ml_warmup_duplicates(self) -> dict[str, int]:
        """Supprime alertes « levee legere » et anomalies en double (warmup / rejeu historique)."""
        with self._lock:
            cur_alerts = self._conn.execute(
                """
                DELETE FROM alerts
                WHERE message LIKE 'Leve legere%'
                   OR message LIKE 'Levée légère%'
                   OR message LIKE 'Levee legere%'
                """
            )
            removed = self.dedupe_anomalies()
            orphans = self.delete_orphan_anomalies()
            self._conn.commit()
        return {
            "alerts_removed": int(cur_alerts.rowcount),
            "anomalies_removed": removed,
            "orphan_anomalies_removed": orphans,
        }

    def insert_alert(self, item: Alert) -> None:
        self._execute_commit(
            """
            INSERT INTO alerts(timestamp, severity, category, source_id, message)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                item.timestamp.isoformat(),
                item.severity,
                item.category,
                item.source_id,
                item.message,
            ),
        )

    def latest_meter_telemetry_by_id(self) -> dict[str, dict[str, Any]]:
        filter_sql, params = self._meter_filter_sql()
        rows = self._fetchall(
            f"""
            SELECT md.meter_id, md.timestamp, md.flow_rate, md.volume
            FROM meter_data md
            INNER JOIN (
                SELECT meter_id, MAX(id) AS max_id
                FROM meter_data
                WHERE {filter_sql}
                GROUP BY meter_id
            ) latest ON md.id = latest.max_id
            """,
            tuple(params),
        )
        return {
            str(row["meter_id"]): {
                "last_reading_at": row["timestamp"],
                "last_flow_rate": float(row["flow_rate"] or 0),
                "last_volume": float(row["volume"] or 0),
            }
            for row in rows
        }

    def latest_anomaly_by_meter_id(self) -> dict[str, dict[str, Any]]:
        filter_sql, params = self._meter_filter_sql()
        rows = self._fetchall(
            f"""
            SELECT a.timestamp, a.meter_id, a.score, a.leak_probability
            FROM anomalies a
            INNER JOIN (
                SELECT meter_id, MAX(id) AS max_id
                FROM anomalies
                WHERE {filter_sql}
                GROUP BY meter_id
            ) latest ON a.id = latest.max_id
            """,
            tuple(params),
        )
        return {str(row["meter_id"]): dict(row) for row in rows}

    def latest_alert_by_meter_id(self) -> dict[str, dict[str, Any]]:
        meter_filter, params = self._meter_filter_sql()
        source_filter = meter_filter.replace("meter_id", "source_id")
        rows = self._fetchall(
            f"""
            SELECT a.timestamp, a.severity, a.category, a.source_id, a.message,
                   COALESCE(a.status, 'active') AS status
            FROM alerts a
            INNER JOIN (
                SELECT source_id, MAX(id) AS max_id
                FROM alerts
                WHERE {source_filter}
                  AND (status IS NULL OR status = '' OR status = 'active')
                GROUP BY source_id
            ) latest ON a.id = latest.max_id
            """,
            tuple(params),
        )
        return {str(row["source_id"]): dict(row) for row in rows}

    def get_latest_anomalies(self, limit: int) -> list[dict]:
        rows = self._fetchall(
            """
            SELECT timestamp, meter_id, score, leak_probability
            FROM anomalies ORDER BY id DESC LIMIT ?
            """,
            (limit,),
        )
        return [dict(row) for row in rows]

    def get_latest_alerts(self, limit: int) -> list[dict]:
        rows = self._fetchall(
            """
            SELECT id, timestamp, severity, category, source_id, message,
                   COALESCE(status, 'active') AS status, admin_notes, resolved_at
            FROM alerts ORDER BY id DESC LIMIT ?
            """,
            (limit,),
        )
        return [dict(row) for row in rows]

    def counts(self) -> dict[str, int]:
        meter = self._fetchone("SELECT COUNT(*) AS n FROM meter_data")["n"]
        pressure = self._fetchone("SELECT COUNT(*) AS n FROM pressure_data")["n"]
        anomalies = self._fetchone("SELECT COUNT(*) AS n FROM anomalies")["n"]
        alerts = self._fetchone("SELECT COUNT(*) AS n FROM alerts")["n"]
        return {
            "meter_data": int(meter),
            "pressure_data": int(pressure),
            "anomalies": int(anomalies),
            "alerts": int(alerts),
        }

    def meter_kpis(self) -> dict[str, Any]:
        """KPIs reseau. Debit unitaire : m3/h = delta index cumule (m3) / delta t (h)."""
        meter_filter, meter_params = self._meter_filter_sql()
        cap = MAX_FLOW_RATE_M3H_KPI
        base = self._fetchone(
            f"""
            SELECT
                COUNT(*) AS total_points,
                COUNT(DISTINCT meter_id) AS distinct_meters,
                COALESCE(AVG(flow_rate), 0.0) AS avg_flow_per_reading,
                COALESCE(MAX(flow_rate), 0.0) AS max_flow_raw
            FROM meter_data
            WHERE {meter_filter}
            """,
            tuple(meter_params),
        )
        flow_rows = self._fetchall(
            f"""
            SELECT meter_id, flow_rate
            FROM meter_data
            WHERE {meter_filter} AND flow_rate >= 0 AND flow_rate <= ?
            """,
            tuple(meter_params) + (cap,),
        )
        by_meter: dict[str, list[float]] = defaultdict(list)
        all_capped: list[float] = []
        for row in flow_rows:
            rate = float(row["flow_rate"] or 0.0)
            by_meter[str(row["meter_id"])].append(rate)
            all_capped.append(rate)

        meter_avgs: dict[str, float] = {
            mid: sum(rates) / len(rates) for mid, rates in by_meter.items() if rates
        }
        sep_avgs = [meter_avgs[mid] for mid in SEP_METER_IDS if mid in meter_avgs]

        sep_placeholders = ",".join("?" * len(SEP_METER_IDS))
        sep_volume_row = self._fetchone(
            f"""
            SELECT COALESCE(SUM(meter_volume), 0.0) AS sep_total_volume
            FROM (
                SELECT MAX(volume) - MIN(volume) AS meter_volume
                FROM meter_data
                WHERE meter_id IN ({sep_placeholders})
                GROUP BY meter_id
            )
            """,
            tuple(SEP_METER_IDS),
        )
        volume_row = self._fetchone(
            f"""
            SELECT COALESCE(SUM(meter_volume), 0.0) AS total_volume
            FROM (
                SELECT MAX(volume) - MIN(volume) AS meter_volume
                FROM meter_data
                WHERE {meter_filter}
                GROUP BY meter_id
            )
            """,
            tuple(meter_params),
        )

        typical_flow = statistics.median(meter_avgs.values()) if meter_avgs else 0.0
        network_total_flow = sum(meter_avgs.values()) if meter_avgs else 0.0
        meters_with_flow = len(meter_avgs)
        sep_sources_flow = sum(sep_avgs) if sep_avgs else 0.0
        max_flow_robust = max(all_capped) if all_capped else 0.0

        return {
            **dict(base),
            "avg_flow": float(typical_flow),
            "network_total_flow": float(network_total_flow),
            "meters_with_flow": meters_with_flow,
            "registry_meter_count": len(NETWORK_METER_IDS),
            "sep_sources_flow": float(sep_sources_flow),
            "avg_flow_per_reading": float(base["avg_flow_per_reading"] or 0),
            "max_flow": float(max_flow_robust),
            "max_flow_raw": float(base["max_flow_raw"] or 0),
            "total_volume": float(volume_row["total_volume"] or 0),
            "sep_total_volume": float(sep_volume_row["sep_total_volume"] or 0),
            "flow_unit": "m3/h",
            "volume_unit": "m3",
            "flow_cap_m3h": cap,
        }

    def sensor_kpis(self) -> dict[str, Any]:
        row = self._fetchone(
            """
            SELECT
                COUNT(*) AS total_points,
                COUNT(DISTINCT sensor_id) AS distinct_sensors,
                COUNT(DISTINCT zone) AS distinct_zones,
                COALESCE(AVG(intensity), 0.0) AS avg_intensity,
                COALESCE(MAX(intensity), 0.0) AS max_intensity
            FROM pressure_data
            """
        )
        return dict(row)

    def top_anomalous_meters(self, limit: int = 6) -> list[dict]:
        meter_filter, meter_params = self._meter_filter_sql()
        rows = self._fetchall(
            f"""
            SELECT meter_id, COUNT(*) AS anomaly_count, AVG(score) AS avg_score
            FROM anomalies
            WHERE {meter_filter}
            GROUP BY meter_id
            ORDER BY anomaly_count DESC, avg_score DESC
            LIMIT ?
            """,
            (*meter_params, limit),
        )
        return [dict(row) for row in rows]

    def top_alert_sources(self, limit: int = 6) -> list[dict]:
        meter_filter, meter_params = self._meter_filter_sql()
        rows = self._fetchall(
            f"""
            SELECT source_id, COUNT(*) AS alert_count
            FROM alerts
            WHERE {meter_filter.replace('meter_id', 'source_id')}
            GROUP BY source_id
            ORDER BY alert_count DESC
            LIMIT ?
            """,
            (*meter_params, limit),
        )
        return [dict(row) for row in rows]

    def timeseries(self, bucket_minutes: int = 30, points: int = 24) -> list[dict]:
        bm = bucket_minutes
        rows = self._fetchall(
            """
            WITH anomaly_buckets AS (
                SELECT
                    strftime(
                        '%Y-%m-%dT%H:%M:00Z',
                        datetime(
                            (CAST(strftime('%s', timestamp) AS INTEGER) / (? * 60)) * (? * 60),
                            'unixepoch'
                        )
                    ) AS bucket,
                    SUM(CASE WHEN leak_probability < 0.25 THEN 1 ELSE 0 END) AS anom_normal,
                    SUM(
                        CASE
                            WHEN leak_probability >= 0.25 AND leak_probability < 0.5 THEN 1
                            ELSE 0
                        END
                    ) AS anom_caution,
                    SUM(
                        CASE
                            WHEN leak_probability >= 0.5 AND leak_probability < 0.75 THEN 1
                            ELSE 0
                        END
                    ) AS anom_warning,
                    SUM(CASE WHEN leak_probability >= 0.75 THEN 1 ELSE 0 END) AS anom_critical
                FROM anomalies
                GROUP BY bucket
            ),
            alert_buckets AS (
                SELECT
                    strftime(
                        '%Y-%m-%dT%H:%M:00Z',
                        datetime(
                            (CAST(strftime('%s', timestamp) AS INTEGER) / (? * 60)) * (? * 60),
                            'unixepoch'
                        )
                    ) AS bucket,
                    SUM(CASE WHEN severity IN ('normal', 'nominal', 'info') THEN 1 ELSE 0 END) AS alert_normal,
                    SUM(CASE WHEN severity = 'caution' THEN 1 ELSE 0 END) AS alert_caution,
                    SUM(CASE WHEN severity = 'warning' THEN 1 ELSE 0 END) AS alert_warning,
                    SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END) AS alert_critical
                FROM alerts
                GROUP BY bucket
            ),
            all_buckets AS (
                SELECT bucket FROM anomaly_buckets
                UNION
                SELECT bucket FROM alert_buckets
            )
            SELECT
                ab.bucket AS bucket,
                COALESCE(a.anom_normal, 0) AS anom_normal,
                COALESCE(a.anom_caution, 0) AS anom_caution,
                COALESCE(a.anom_warning, 0) AS anom_warning,
                COALESCE(a.anom_critical, 0) AS anom_critical,
                (
                    COALESCE(a.anom_normal, 0)
                    + COALESCE(a.anom_caution, 0)
                    + COALESCE(a.anom_warning, 0)
                    + COALESCE(a.anom_critical, 0)
                ) AS anomalies,
                COALESCE(b.alert_normal, 0) AS alert_normal,
                COALESCE(b.alert_caution, 0) AS alert_caution,
                COALESCE(b.alert_warning, 0) AS alert_warning,
                COALESCE(b.alert_critical, 0) AS alert_critical,
                (
                    COALESCE(b.alert_normal, 0)
                    + COALESCE(b.alert_caution, 0)
                    + COALESCE(b.alert_warning, 0)
                    + COALESCE(b.alert_critical, 0)
                ) AS alerts
            FROM all_buckets ab
            LEFT JOIN anomaly_buckets a ON a.bucket = ab.bucket
            LEFT JOIN alert_buckets b ON b.bucket = ab.bucket
            ORDER BY ab.bucket DESC
            LIMIT ?
            """,
            (bm, bm, bm, bm, points),
        )
        data = [dict(row) for row in rows]
        data.reverse()
        return data

    def anomaly_max_leak_by_bucket(self, bucket_minutes: int, points: int) -> list[dict]:
        bm = bucket_minutes
        rows = self._fetchall(
            """
            SELECT
                strftime(
                    '%Y-%m-%dT%H:%M:00Z',
                    datetime(
                        (CAST(strftime('%s', timestamp) AS INTEGER) / (? * 60)) * (? * 60),
                        'unixepoch'
                    )
                ) AS bucket,
                MAX(leak_probability) AS max_leak
            FROM anomalies
            GROUP BY bucket
            ORDER BY bucket DESC
            LIMIT ?
            """,
            (bm, bm, points),
        )
        data = [dict(row) for row in rows]
        data.reverse()
        return data

    def meter_flow_timeseries(self, bucket_minutes: int = 60, points: int = 24) -> list[dict]:
        rows = self._fetchall(
            """
            SELECT
                strftime(
                    '%Y-%m-%dT%H:%M:00Z',
                    datetime(
                        (CAST(strftime('%s', timestamp) AS INTEGER) / (? * 60)) * (? * 60),
                        'unixepoch'
                    )
                ) AS bucket,
                COALESCE(AVG(flow_rate), 0.0) AS avg_flow,
                COUNT(*) AS samples
            FROM meter_data
            GROUP BY bucket
            ORDER BY bucket DESC
            LIMIT ?
            """,
            (bucket_minutes, bucket_minutes, points),
        )
        data = [dict(row) for row in rows]
        data.reverse()
        leaks = self.anomaly_max_leak_by_bucket(bucket_minutes=bucket_minutes, points=points)
        leak_map = {row["bucket"]: float(row["max_leak"] or 0.0) for row in leaks}
        for row in data:
            row["max_leak_probability"] = leak_map.get(row["bucket"], 0.0)
        return data

    def meter_flow_per_meter_series(
        self,
        bucket_minutes: int = 60,
        points: int = 72,
        meter_order: list[str] | None = None,
        limit_meters: int = 12,
    ) -> dict[str, Any]:
        if meter_order:
            meter_ids = list(meter_order)
        else:
            top_rows = self._fetchall(
                """
                SELECT meter_id
                FROM meter_data
                GROUP BY meter_id
                ORDER BY COUNT(*) DESC
                LIMIT ?
                """,
                (limit_meters,),
            )
            meter_ids = [str(row["meter_id"]) for row in top_rows]
        if not meter_ids:
            return {"buckets": [], "series": []}

        placeholders = ",".join("?" * len(meter_ids))
        sql = f"""
            SELECT
                meter_id,
                strftime(
                    '%Y-%m-%dT%H:%M:00Z',
                    datetime(
                        (CAST(strftime('%s', timestamp) AS INTEGER) / (? * 60)) * (? * 60),
                        'unixepoch'
                    )
                ) AS bucket,
                COALESCE(AVG(flow_rate), 0.0) AS avg_flow,
                COUNT(*) AS samples
            FROM meter_data
            WHERE meter_id IN ({placeholders})
            GROUP BY meter_id, bucket
            ORDER BY bucket ASC
        """
        params: list[Any] = [bucket_minutes, bucket_minutes, *meter_ids]
        rows = self._fetchall(sql, tuple(params))

        by_meter: dict[str, dict[str, float]] = defaultdict(dict)
        all_buckets: set[str] = set()
        for row in rows:
            b = str(row["bucket"])
            all_buckets.add(b)
            by_meter[str(row["meter_id"])][b] = float(row["avg_flow"] or 0)

        sorted_buckets = sorted(all_buckets)
        tail = sorted_buckets[-points:] if len(sorted_buckets) > points else sorted_buckets

        series: list[dict[str, Any]] = []
        for mid in meter_ids:
            pts = [{"bucket": b, "avg_flow": float(by_meter[mid].get(b, 0.0))} for b in tail]
            series.append({"meter_id": mid, "points": pts})

        return {"buckets": tail, "series": series}

    def pressure_intensity_timeseries(self, bucket_minutes: int = 60, points: int = 24) -> list[dict]:
        rows = self._fetchall(
            """
            SELECT
                strftime(
                    '%Y-%m-%dT%H:%M:00Z',
                    datetime(
                        (CAST(strftime('%s', timestamp) AS INTEGER) / (? * 60)) * (? * 60),
                        'unixepoch'
                    )
                ) AS bucket,
                COALESCE(AVG(intensity), 0.0) AS avg_intensity,
                COALESCE(AVG(frequency), 0.0) AS avg_frequency,
                COUNT(*) AS samples
            FROM pressure_data
            GROUP BY bucket
            ORDER BY bucket DESC
            LIMIT ?
            """,
            (bucket_minutes, bucket_minutes, points),
        )
        data = [dict(row) for row in rows]
        data.reverse()
        return data

    def meter_profile(
        self,
        meter_id: str,
        bucket_minutes: int = 30,
        points: int = 48,
        recent_limit: int = 12,
    ) -> dict[str, Any]:
        kpi_row = self._fetchone(
            """
            SELECT
                COUNT(*) AS total_points,
                COALESCE(AVG(flow_rate), 0.0) AS avg_flow,
                COALESCE(MAX(flow_rate), 0.0) AS max_flow,
                COALESCE(MAX(volume) - MIN(volume), 0.0) AS total_volume
            FROM meter_data
            WHERE meter_id = ?
            """,
            (meter_id,),
        )
        anomaly_row = self._fetchone(
            """
            SELECT
                COUNT(*) AS anomaly_points,
                COALESCE(AVG(score), 0.0) AS avg_anomaly_score,
                COALESCE(MAX(score), 0.0) AS max_anomaly_score,
                COALESCE(AVG(leak_probability), 0.0) AS avg_leak_probability,
                COALESCE(MAX(leak_probability), 0.0) AS max_leak_probability
            FROM anomalies
            WHERE meter_id = ?
            """,
            (meter_id,),
        )
        kpis = {**dict(kpi_row), **dict(anomaly_row)}

        flow_rows = self._fetchall(
            """
            WITH meter_buckets AS (
                SELECT
                    strftime(
                        '%Y-%m-%dT%H:%M:00Z',
                        datetime(
                            (CAST(strftime('%s', timestamp) AS INTEGER) / (? * 60)) * (? * 60),
                            'unixepoch'
                        )
                    ) AS bucket,
                    COALESCE(AVG(flow_rate), 0.0) AS avg_flow,
                    COALESCE(SUM(volume), 0.0) AS total_volume,
                    COUNT(*) AS samples
                FROM meter_data
                WHERE meter_id = ?
                GROUP BY bucket
            ),
            anomaly_buckets AS (
                SELECT
                    strftime(
                        '%Y-%m-%dT%H:%M:00Z',
                        datetime(
                            (CAST(strftime('%s', timestamp) AS INTEGER) / (? * 60)) * (? * 60),
                            'unixepoch'
                        )
                    ) AS bucket,
                    MAX(leak_probability) AS max_leak_probability
                FROM anomalies
                WHERE meter_id = ?
                GROUP BY bucket
            )
            SELECT
                mb.bucket AS bucket,
                mb.avg_flow AS avg_flow,
                mb.total_volume AS total_volume,
                mb.samples AS samples,
                COALESCE(ab.max_leak_probability, 0.0) AS max_leak_probability
            FROM meter_buckets mb
            LEFT JOIN anomaly_buckets ab ON ab.bucket = mb.bucket
            ORDER BY mb.bucket DESC
            LIMIT ?
            """,
            (bucket_minutes, bucket_minutes, meter_id, bucket_minutes, bucket_minutes, meter_id, points),
        )
        flow_series = [dict(row) for row in flow_rows]
        flow_series.reverse()

        risk_rows = self._fetchone(
            """
            SELECT
                SUM(CASE WHEN leak_probability < 0.25 THEN 1 ELSE 0 END) AS normal,
                SUM(
                    CASE WHEN leak_probability >= 0.25 AND leak_probability < 0.5 THEN 1 ELSE 0 END
                ) AS caution,
                SUM(
                    CASE WHEN leak_probability >= 0.5 AND leak_probability < 0.75 THEN 1 ELSE 0 END
                ) AS warning,
                SUM(CASE WHEN leak_probability >= 0.75 THEN 1 ELSE 0 END) AS critical
            FROM anomalies
            WHERE meter_id = ?
            """,
            (meter_id,),
        )
        risk_distribution = dict(risk_rows)

        anomaly_items = self._fetchall(
            """
            SELECT timestamp, meter_id, score, leak_probability
            FROM anomalies
            WHERE meter_id = ?
            ORDER BY id DESC
            LIMIT ?
            """,
            (meter_id, recent_limit),
        )
        alert_items = self._fetchall(
            """
            SELECT timestamp, severity, category, source_id, message
            FROM alerts
            WHERE source_id = ?
            ORDER BY id DESC
            LIMIT ?
            """,
            (meter_id, recent_limit),
        )

        return {
            "meter_id": meter_id,
            "kpis": kpis,
            "flow_series": flow_series,
            "risk_distribution": risk_distribution,
            "recent_anomalies": [dict(row) for row in anomaly_items],
            "recent_alerts": [dict(row) for row in alert_items],
            "classification_model": "IsolationForest(n=300)+seuils quantiles decision (HydroTrack IA)",
            "classification_scope": "Applique a chaque compteur individuellement",
        }

    def alert_stats(self) -> dict[str, Any]:
        by_severity = self._fetchall(
            """
            SELECT severity, COUNT(*) AS count
            FROM alerts
            GROUP BY severity
            """
        )
        by_category = self._fetchall(
            """
            SELECT category, COUNT(*) AS count
            FROM alerts
            GROUP BY category
            """
        )
        total = self._fetchone("SELECT COUNT(*) AS n FROM alerts")["n"]
        last_24h = self._fetchone(
            """
            SELECT COUNT(*) AS n FROM alerts
            WHERE datetime(timestamp) >= datetime('now', '-1 day')
            """
        )["n"]
        return {
            "total": int(total),
            "last_24h": int(last_24h),
            "by_severity": [dict(row) for row in by_severity],
            "by_category": [dict(row) for row in by_category],
        }

    def clear_meter_telemetry(self) -> None:
        placeholders = ",".join("?" * len(NETWORK_METER_IDS))
        with self._lock:
            self._conn.execute("DELETE FROM meter_data")
            self._conn.execute(f"DELETE FROM anomalies WHERE meter_id IN ({placeholders})", NETWORK_METER_IDS)
            self._conn.execute(f"DELETE FROM alerts WHERE source_id IN ({placeholders})", NETWORK_METER_IDS)
            self._conn.commit()

    def sensors_catalog(self) -> list[dict[str, Any]]:
        rows = self._fetchall(
            """
            SELECT
                sensor_id,
                zone,
                COUNT(*) AS points,
                MAX(timestamp) AS last_seen
            FROM pressure_data
            GROUP BY sensor_id, zone
            ORDER BY sensor_id ASC
            """
        )
        return [dict(row) for row in rows]

    def list_manual_readings(self, limit: int = 10, meter_id: str | None = None) -> list[dict]:
        if meter_id:
            rows = self._fetchall(
                """
                SELECT id, timestamp, meter_id, volume, flow_rate, notes, meter_data_id,
                       created_at, updated_at
                FROM manual_meter_readings
                WHERE meter_id = ?
                ORDER BY datetime(timestamp) DESC, id DESC
                LIMIT ?
                """,
                (meter_id, limit),
            )
        else:
            rows = self._fetchall(
                """
                SELECT id, timestamp, meter_id, volume, flow_rate, notes, meter_data_id,
                       created_at, updated_at
                FROM manual_meter_readings
                ORDER BY datetime(timestamp) DESC, id DESC
                LIMIT ?
                """,
                (limit,),
            )
        return [dict(row) for row in rows]

    def get_manual_reading(self, reading_id: int) -> dict | None:
        row = self._fetchone(
            """
            SELECT id, timestamp, meter_id, volume, flow_rate, notes, meter_data_id,
                   created_at, updated_at
            FROM manual_meter_readings
            WHERE id = ?
            """,
            (reading_id,),
        )
        return dict(row) if row else None

    def insert_manual_reading(
        self,
        timestamp: str,
        meter_id: str,
        volume: float,
        flow_rate: float,
        notes: str,
        meter_data_id: int | None,
        created_at: str,
        updated_at: str,
    ) -> int:
        with self._lock:
            cur = self._conn.execute(
                """
                INSERT INTO manual_meter_readings(
                    timestamp, meter_id, volume, flow_rate, notes,
                    meter_data_id, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (timestamp, meter_id, volume, flow_rate, notes, meter_data_id, created_at, updated_at),
            )
            self._conn.commit()
            return int(cur.lastrowid)

    def update_manual_reading(
        self,
        reading_id: int,
        timestamp: str,
        meter_id: str,
        volume: float,
        flow_rate: float,
        notes: str,
        meter_data_id: int | None,
        updated_at: str,
    ) -> bool:
        self._execute_commit(
            """
            UPDATE manual_meter_readings
            SET timestamp = ?, meter_id = ?, volume = ?, flow_rate = ?, notes = ?,
                meter_data_id = ?, updated_at = ?
            WHERE id = ?
            """,
            (timestamp, meter_id, volume, flow_rate, notes, meter_data_id, updated_at, reading_id),
        )
        return self.get_manual_reading(reading_id) is not None

    def delete_manual_reading(self, reading_id: int) -> dict | None:
        row = self.get_manual_reading(reading_id)
        if not row:
            return None
        self._execute_commit("DELETE FROM manual_meter_readings WHERE id = ?", (reading_id,))
        return row

    def latest_pressure_by_sensor_ids(self, sensor_ids: list[str]) -> dict[str, dict[str, Any]]:
        if not sensor_ids:
            return {}
        placeholders = ",".join("?" * len(sensor_ids))
        rows = self._fetchall(
            f"""
            SELECT p.sensor_id, p.timestamp, p.zone, p.pressure_signal, p.frequency, p.intensity
            FROM pressure_data p
            INNER JOIN (
                SELECT sensor_id, MAX(id) AS max_id
                FROM pressure_data
                WHERE sensor_id IN ({placeholders})
                GROUP BY sensor_id
            ) latest ON p.id = latest.max_id
            """,
            tuple(sensor_ids),
        )
        return {str(row["sensor_id"]): dict(row) for row in rows}

    def insert_leak_localization(self, record: dict[str, Any]) -> int:
        with self._lock:
            cur = self._conn.execute(
                """
                INSERT INTO leak_localizations(
                    timestamp, zone_id, segment_id, upstream_meter, downstream_meter,
                    confirmed, confirmation_confidence, distance_m_from_upstream,
                    segment_length_m, position_ratio, localization_confidence,
                    plan_x, plan_y, pressure_leak_score, sensor_correlation,
                    trigger_sensor_id, meter_source,
                    wave_speed_m_s, delta_t_s, delta_t_method, transient_score, pipe_material,
                    leak_radius_m
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record["timestamp"],
                    int(record["zone_id"]),
                    record["segment_id"],
                    record.get("upstream_meter"),
                    record.get("downstream_meter"),
                    1 if record.get("confirmed") else 0,
                    float(record.get("confirmation_confidence") or 0),
                    record.get("distance_m_from_upstream"),
                    record.get("segment_length_m"),
                    record.get("position_ratio"),
                    record.get("localization_confidence"),
                    record.get("plan_x"),
                    record.get("plan_y"),
                    record.get("pressure_leak_score"),
                    record.get("sensor_correlation"),
                    record.get("trigger_sensor_id"),
                    record.get("meter_source"),
                    record.get("wave_speed_m_s"),
                    record.get("delta_t_s"),
                    record.get("delta_t_method"),
                    record.get("transient_score"),
                    record.get("pipe_material"),
                    record.get("leak_radius_m"),
                ),
            )
            self._conn.commit()
            return int(cur.lastrowid)

    def get_leak_localizations(self, limit: int = 20, confirmed_only: bool = False) -> list[dict[str, Any]]:
        sql = """
            SELECT *
            FROM leak_localizations
        """
        if confirmed_only:
            sql += " WHERE confirmed = 1"
        sql += " ORDER BY id DESC LIMIT ?"
        rows = self._fetchall(sql, (limit,))
        items = []
        for row in rows:
            item = dict(row)
            item["confirmed"] = bool(item.get("confirmed"))
            items.append(item)
        return items

    def latest_leak_by_zone(self) -> dict[int, dict[str, Any]]:
        rows = self._fetchall(
            """
            SELECT l.*
            FROM leak_localizations l
            INNER JOIN (
                SELECT zone_id, MAX(id) AS max_id
                FROM leak_localizations
                GROUP BY zone_id
            ) latest ON l.id = latest.max_id
            """
        )
        return {int(row["zone_id"]): dict(row) for row in rows}
