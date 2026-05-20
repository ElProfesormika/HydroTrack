"""Persistance admin : registre reseau, incidents fuite, alertes, audit."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from . import network_topology
from .models import Alert
from .registry import NetworkRegistry


class AdminStore:
    def __init__(self, sqlite: Any, registry: NetworkRegistry) -> None:
        self.sqlite = sqlite
        self.registry = registry
        self._ensure_schema()
        self.bootstrap_registry_if_empty()

    def _ensure_schema(self) -> None:
        self.sqlite._conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS registry_meters (
                meter_id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                plan_x REAL,
                plan_y REAL,
                lat REAL,
                lng REAL,
                active INTEGER NOT NULL DEFAULT 1,
                notes TEXT DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS registry_zones (
                zone_id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                short_name TEXT,
                plan_x REAL,
                plan_y REAL,
                lat REAL,
                lng REAL,
                active INTEGER NOT NULL DEFAULT 1,
                notes TEXT DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS registry_segments (
                segment_id TEXT PRIMARY KEY,
                zone_id INTEGER NOT NULL,
                upstream_meter TEXT NOT NULL,
                downstream_meter TEXT NOT NULL,
                length_m REAL NOT NULL DEFAULT 100,
                active INTEGER NOT NULL DEFAULT 1,
                notes TEXT DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS registry_sensors (
                sensor_id TEXT PRIMARY KEY,
                zone_id INTEGER NOT NULL,
                segment_id TEXT,
                role TEXT DEFAULT 'upstream',
                name TEXT NOT NULL,
                active INTEGER NOT NULL DEFAULT 1,
                notes TEXT DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS leak_incidents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                localization_id INTEGER,
                zone_id INTEGER,
                segment_id TEXT,
                status TEXT NOT NULL DEFAULT 'open',
                detected_at TEXT NOT NULL,
                repaired_at TEXT,
                upstream_meter TEXT,
                downstream_meter TEXT,
                distance_m_from_upstream REAL,
                meter_source TEXT,
                admin_notes TEXT DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS admin_audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                action TEXT NOT NULL,
                entity_type TEXT NOT NULL,
                entity_id TEXT NOT NULL,
                details TEXT
            );
            """
        )
        for col_sql in (
            "ALTER TABLE alerts ADD COLUMN status TEXT DEFAULT 'active'",
            "ALTER TABLE alerts ADD COLUMN admin_notes TEXT DEFAULT ''",
            "ALTER TABLE alerts ADD COLUMN resolved_at TEXT",
            "ALTER TABLE registry_sensors ADD COLUMN plan_x REAL",
            "ALTER TABLE registry_sensors ADD COLUMN plan_y REAL",
        ):
            try:
                self.sqlite._conn.execute(col_sql)
            except Exception:
                pass
        self.sqlite._conn.commit()

    def bootstrap_registry_if_empty(self) -> None:
        row = self.sqlite._fetchone("SELECT COUNT(*) AS n FROM registry_meters")
        if int(row["n"]) > 0:
            self.sync_topology_from_defaults()
            self.reload_registry()
            return
        self.registry.load_defaults()
        now = datetime.now(timezone.utc).isoformat()
        for m in self.registry.meters:
            self.sqlite._execute_commit(
                """
                INSERT INTO registry_meters(
                    meter_id, name, plan_x, plan_y, lat, lng, active, notes, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    m["meter_id"],
                    m["name"],
                    m.get("plan_x"),
                    m.get("plan_y"),
                    m.get("lat"),
                    m.get("lng"),
                    1,
                    m.get("notes") or "",
                    now,
                    now,
                ),
            )
        for z in self.registry.zones:
            self.sqlite._execute_commit(
                """
                INSERT INTO registry_zones(
                    zone_id, name, short_name, plan_x, plan_y, lat, lng, active, notes, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    z["zone_id"],
                    z["name"],
                    z.get("short_name"),
                    z.get("plan_x"),
                    z.get("plan_y"),
                    z.get("lat"),
                    z.get("lng"),
                    1,
                    z.get("notes") or "",
                    now,
                    now,
                ),
            )
        for s in self.registry.segments:
            self.sqlite._execute_commit(
                """
                INSERT INTO registry_segments(
                    segment_id, zone_id, upstream_meter, downstream_meter, length_m,
                    active, notes, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    s["segment_id"],
                    s["zone_id"],
                    s["upstream_meter"],
                    s["downstream_meter"],
                    s["length_m"],
                    1,
                    s.get("notes") or "",
                    now,
                    now,
                ),
            )
        for sensor in self.registry.sensors:
            self.sqlite._execute_commit(
                """
                INSERT INTO registry_sensors(
                    sensor_id, zone_id, segment_id, role, name, plan_x, plan_y,
                    active, notes, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    sensor["sensor_id"],
                    sensor["zone_id"],
                    sensor.get("segment_id"),
                    sensor.get("role"),
                    sensor["name"],
                    sensor.get("plan_x"),
                    sensor.get("plan_y"),
                    1,
                    sensor.get("notes") or "",
                    now,
                    now,
                ),
            )
        self.reload_registry()

    def sync_topology_from_defaults(self) -> None:
        """Recharge zones / troncons / capteurs si la topologie a change (~300 m / 10 km)."""
        row = self.sqlite._fetchone("SELECT COUNT(*) AS n FROM registry_zones")
        current = int(row["n"] or 0)
        if current == network_topology.ZONE_COUNT:
            return
        self.registry.load_defaults()
        now = datetime.now(timezone.utc).isoformat()
        with self.sqlite._lock:
            self.sqlite._conn.execute("DELETE FROM registry_sensors")
            self.sqlite._conn.execute("DELETE FROM registry_segments")
            self.sqlite._conn.execute("DELETE FROM registry_zones")
            self.sqlite._conn.commit()
        for z in self.registry.zones:
            self.sqlite._execute_commit(
                """
                INSERT INTO registry_zones(
                    zone_id, name, short_name, plan_x, plan_y, lat, lng, active, notes, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    z["zone_id"],
                    z["name"],
                    z.get("short_name"),
                    z.get("plan_x"),
                    z.get("plan_y"),
                    z.get("lat"),
                    z.get("lng"),
                    1,
                    z.get("notes") or "",
                    now,
                    now,
                ),
            )
        for s in self.registry.segments:
            self.sqlite._execute_commit(
                """
                INSERT INTO registry_segments(
                    segment_id, zone_id, upstream_meter, downstream_meter, length_m,
                    active, notes, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    s["segment_id"],
                    s["zone_id"],
                    s["upstream_meter"],
                    s["downstream_meter"],
                    s["length_m"],
                    1,
                    s.get("notes") or "",
                    now,
                    now,
                ),
            )
        for sensor in self.registry.sensors:
            self.sqlite._execute_commit(
                """
                INSERT INTO registry_sensors(
                    sensor_id, zone_id, segment_id, role, name, plan_x, plan_y,
                    active, notes, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    sensor["sensor_id"],
                    sensor["zone_id"],
                    sensor.get("segment_id"),
                    sensor.get("role"),
                    sensor["name"],
                    sensor.get("plan_x"),
                    sensor.get("plan_y"),
                    1,
                    sensor.get("notes") or "",
                    now,
                    now,
                ),
            )
        self._audit("sync", "topology", f"v{network_topology.TOPOLOGY_VERSION}")

    def reload_registry(self) -> None:
        meters = [dict(r) for r in self.sqlite._fetchall("SELECT * FROM registry_meters ORDER BY meter_id")]
        zones = [dict(r) for r in self.sqlite._fetchall("SELECT * FROM registry_zones ORDER BY zone_id")]
        segments = [dict(r) for r in self.sqlite._fetchall("SELECT * FROM registry_segments ORDER BY zone_id")]
        sensors = [dict(r) for r in self.sqlite._fetchall("SELECT * FROM registry_sensors ORDER BY sensor_id")]
        self.registry.load_from_rows(meters, zones, segments, sensors)
        self.sqlite.set_active_meter_ids(self.registry.meter_ids)

    def _audit(self, action: str, entity_type: str, entity_id: str, details: str = "") -> None:
        self.sqlite._execute_commit(
            """
            INSERT INTO admin_audit_log(timestamp, action, entity_type, entity_id, details)
            VALUES (?, ?, ?, ?, ?)
            """,
            (datetime.now(timezone.utc).isoformat(), action, entity_type, entity_id, details),
        )

    def overview(self) -> dict[str, Any]:
        counts = self.sqlite.counts()
        return {
            "meters": len(self.registry.meters),
            "zones": len(self.registry.zones),
            "sensors": len(self.registry.sensors),
            "segments": len(self.registry.segments),
            "telemetry": counts,
            "open_leaks": self.sqlite._fetchone(
                "SELECT COUNT(*) AS n FROM leak_incidents WHERE status IN ('open','confirmed')"
            )["n"],
            "repaired_leaks": self.sqlite._fetchone(
                "SELECT COUNT(*) AS n FROM leak_incidents WHERE status = 'repaired'"
            )["n"],
            "active_alerts": self.sqlite._fetchone(
                "SELECT COUNT(*) AS n FROM alerts WHERE COALESCE(status,'active') = 'active'"
            )["n"],
        }

    # —— Compteurs ——
    def list_meters(self, include_inactive: bool = True) -> list[dict]:
        sql = "SELECT * FROM registry_meters"
        if not include_inactive:
            sql += " WHERE active = 1"
        sql += " ORDER BY meter_id"
        return [dict(r) for r in self.sqlite._fetchall(sql)]

    def create_meter(self, data: dict[str, Any]) -> dict:
        now = datetime.now(timezone.utc).isoformat()
        mid = str(data["meter_id"]).strip().upper().replace(" ", "_")
        self.sqlite._execute_commit(
            """
            INSERT INTO registry_meters(
                meter_id, name, plan_x, plan_y, lat, lng, active, notes, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                mid,
                data.get("name") or mid,
                data.get("plan_x"),
                data.get("plan_y"),
                data.get("lat"),
                data.get("lng"),
                1 if data.get("active", True) else 0,
                data.get("notes") or "",
                now,
                now,
            ),
        )
        self._audit("create", "meter", mid)
        self.reload_registry()
        return self.get_meter(mid)

    def get_meter(self, meter_id: str) -> dict:
        row = self.sqlite._fetchone("SELECT * FROM registry_meters WHERE meter_id = ?", (meter_id,))
        if not row:
            raise ValueError("Compteur introuvable")
        return dict(row)

    def update_meter(self, meter_id: str, data: dict[str, Any]) -> dict:
        current = self.get_meter(meter_id)
        now = datetime.now(timezone.utc).isoformat()
        self.sqlite._execute_commit(
            """
            UPDATE registry_meters SET
                name = ?, plan_x = ?, plan_y = ?, lat = ?, lng = ?,
                active = ?, notes = ?, updated_at = ?
            WHERE meter_id = ?
            """,
            (
                data.get("name", current["name"]),
                data.get("plan_x", current.get("plan_x")),
                data.get("plan_y", current.get("plan_y")),
                data.get("lat", current.get("lat")),
                data.get("lng", current.get("lng")),
                1 if data.get("active", current.get("active", 1)) else 0,
                data.get("notes", current.get("notes") or ""),
                now,
                meter_id,
            ),
        )
        self._audit("update", "meter", meter_id)
        self.reload_registry()
        return self.get_meter(meter_id)

    def delete_meter(self, meter_id: str, hard: bool = False) -> dict:
        if hard:
            self.sqlite._execute_commit("DELETE FROM registry_meters WHERE meter_id = ?", (meter_id,))
        else:
            self.update_meter(meter_id, {"active": False})
        self._audit("delete" if hard else "deactivate", "meter", meter_id)
        self.reload_registry()
        return {"deleted": meter_id, "hard": hard}

    # —— Zones ——
    def list_zones(self, include_inactive: bool = True) -> list[dict]:
        sql = "SELECT * FROM registry_zones"
        if not include_inactive:
            sql += " WHERE active = 1"
        sql += " ORDER BY zone_id"
        return [dict(r) for r in self.sqlite._fetchall(sql)]

    def create_zone(self, data: dict[str, Any]) -> dict:
        now = datetime.now(timezone.utc).isoformat()
        zid = int(data["zone_id"])
        self.sqlite._execute_commit(
            """
            INSERT INTO registry_zones(
                zone_id, name, short_name, plan_x, plan_y, lat, lng, active, notes, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                zid,
                data["name"],
                data.get("short_name"),
                data.get("plan_x"),
                data.get("plan_y"),
                data.get("lat"),
                data.get("lng"),
                1 if data.get("active", True) else 0,
                data.get("notes") or "",
                now,
                now,
            ),
        )
        self._audit("create", "zone", str(zid))
        self.reload_registry()
        return self.get_zone(zid)

    def get_zone(self, zone_id: int) -> dict:
        row = self.sqlite._fetchone("SELECT * FROM registry_zones WHERE zone_id = ?", (zone_id,))
        if not row:
            raise ValueError("Zone introuvable")
        return dict(row)

    def update_zone(self, zone_id: int, data: dict[str, Any]) -> dict:
        current = self.get_zone(zone_id)
        now = datetime.now(timezone.utc).isoformat()
        self.sqlite._execute_commit(
            """
            UPDATE registry_zones SET
                name = ?, short_name = ?, plan_x = ?, plan_y = ?, lat = ?, lng = ?,
                active = ?, notes = ?, updated_at = ?
            WHERE zone_id = ?
            """,
            (
                data.get("name", current["name"]),
                data.get("short_name", current.get("short_name")),
                data.get("plan_x", current.get("plan_x")),
                data.get("plan_y", current.get("plan_y")),
                data.get("lat", current.get("lat")),
                data.get("lng", current.get("lng")),
                1 if data.get("active", current.get("active", 1)) else 0,
                data.get("notes", current.get("notes") or ""),
                now,
                zone_id,
            ),
        )
        self._audit("update", "zone", str(zone_id))
        self.reload_registry()
        return self.get_zone(zone_id)

    def delete_zone(self, zone_id: int, hard: bool = False) -> dict:
        if hard:
            self.sqlite._execute_commit("DELETE FROM registry_zones WHERE zone_id = ?", (zone_id,))
        else:
            self.update_zone(zone_id, {"active": False})
        self._audit("delete" if hard else "deactivate", "zone", str(zone_id))
        self.reload_registry()
        return {"deleted": zone_id, "hard": hard}

    # —— Capteurs ——
    def list_sensors(self, include_inactive: bool = True) -> list[dict]:
        sql = "SELECT * FROM registry_sensors"
        if not include_inactive:
            sql += " WHERE active = 1"
        sql += " ORDER BY zone_id, sensor_id"
        return [dict(r) for r in self.sqlite._fetchall(sql)]

    def create_sensor(self, data: dict[str, Any]) -> dict:
        now = datetime.now(timezone.utc).isoformat()
        sid = str(data["sensor_id"]).strip()
        self.sqlite._execute_commit(
            """
            INSERT INTO registry_sensors(
                sensor_id, zone_id, segment_id, role, name, plan_x, plan_y,
                active, notes, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                sid,
                int(data["zone_id"]),
                data.get("segment_id"),
                data.get("role") or "upstream",
                data.get("name") or sid,
                data.get("plan_x"),
                data.get("plan_y"),
                1 if data.get("active", True) else 0,
                data.get("notes") or "",
                now,
                now,
            ),
        )
        self._audit("create", "sensor", sid)
        self.reload_registry()
        return self.get_sensor(sid)

    def get_sensor(self, sensor_id: str) -> dict:
        row = self.sqlite._fetchone("SELECT * FROM registry_sensors WHERE sensor_id = ?", (sensor_id,))
        if not row:
            raise ValueError("Capteur introuvable")
        return dict(row)

    def update_sensor(self, sensor_id: str, data: dict[str, Any]) -> dict:
        current = self.get_sensor(sensor_id)
        now = datetime.now(timezone.utc).isoformat()
        self.sqlite._execute_commit(
            """
            UPDATE registry_sensors SET
                zone_id = ?, segment_id = ?, role = ?, name = ?, plan_x = ?, plan_y = ?,
                active = ?, notes = ?, updated_at = ?
            WHERE sensor_id = ?
            """,
            (
                int(data.get("zone_id", current["zone_id"])),
                data.get("segment_id", current.get("segment_id")),
                data.get("role", current.get("role")),
                data.get("name", current["name"]),
                data.get("plan_x", current.get("plan_x")),
                data.get("plan_y", current.get("plan_y")),
                1 if data.get("active", current.get("active", 1)) else 0,
                data.get("notes", current.get("notes") or ""),
                now,
                sensor_id,
            ),
        )
        self._audit("update", "sensor", sensor_id)
        self.reload_registry()
        return self.get_sensor(sensor_id)

    def delete_sensor(self, sensor_id: str, hard: bool = False) -> dict:
        if hard:
            self.sqlite._execute_commit("DELETE FROM registry_sensors WHERE sensor_id = ?", (sensor_id,))
        else:
            self.update_sensor(sensor_id, {"active": False})
        self._audit("delete" if hard else "deactivate", "sensor", sensor_id)
        self.reload_registry()
        return {"deleted": sensor_id, "hard": hard}

    # —— Segments ——
    def list_segments(self) -> list[dict]:
        return [dict(r) for r in self.sqlite._fetchall("SELECT * FROM registry_segments ORDER BY zone_id")]

    def update_segment(self, segment_id: str, data: dict[str, Any]) -> dict:
        current = self.sqlite._fetchone(
            "SELECT * FROM registry_segments WHERE segment_id = ?", (segment_id,)
        )
        if not current:
            raise ValueError("Troncon introuvable")
        current = dict(current)
        now = datetime.now(timezone.utc).isoformat()
        self.sqlite._execute_commit(
            """
            UPDATE registry_segments SET
                upstream_meter = ?, downstream_meter = ?, length_m = ?,
                active = ?, notes = ?, updated_at = ?
            WHERE segment_id = ?
            """,
            (
                data.get("upstream_meter", current["upstream_meter"]),
                data.get("downstream_meter", current["downstream_meter"]),
                float(data.get("length_m", current["length_m"])),
                1 if data.get("active", current.get("active", 1)) else 0,
                data.get("notes", current.get("notes") or ""),
                now,
                segment_id,
            ),
        )
        self._audit("update", "segment", segment_id)
        self.reload_registry()
        row = self.sqlite._fetchone("SELECT * FROM registry_segments WHERE segment_id = ?", (segment_id,))
        return dict(row)

    # —— Alertes ——
    def list_alerts_admin(self, limit: int = 100, status: str | None = None) -> list[dict]:
        if status:
            rows = self.sqlite._fetchall(
                """
                SELECT id, timestamp, severity, category, source_id, message,
                       COALESCE(status,'active') AS status, admin_notes, resolved_at
                FROM alerts WHERE COALESCE(status,'active') = ?
                ORDER BY id DESC LIMIT ?
                """,
                (status, limit),
            )
        else:
            rows = self.sqlite._fetchall(
                """
                SELECT id, timestamp, severity, category, source_id, message,
                       COALESCE(status,'active') AS status, admin_notes, resolved_at
                FROM alerts ORDER BY id DESC LIMIT ?
                """,
                (limit,),
            )
        return [dict(r) for r in rows]

    def update_alert(self, alert_id: int, data: dict[str, Any]) -> dict:
        row = self.sqlite._fetchone("SELECT * FROM alerts WHERE id = ?", (alert_id,))
        if not row:
            raise ValueError("Alerte introuvable")
        status = data.get("status", row.get("status") or "active")
        notes = data.get("admin_notes", row.get("admin_notes") or "")
        resolved = data.get("resolved_at")
        if status == "resolved" and not resolved:
            resolved = datetime.now(timezone.utc).isoformat()
        self.sqlite._execute_commit(
            "UPDATE alerts SET status = ?, admin_notes = ?, resolved_at = ? WHERE id = ?",
            (status, notes, resolved, alert_id),
        )
        self._audit("update", "alert", str(alert_id), status)
        return dict(self.sqlite._fetchone("SELECT * FROM alerts WHERE id = ?", (alert_id,)))

    def delete_alert(self, alert_id: int) -> dict:
        self.sqlite._execute_commit("DELETE FROM alerts WHERE id = ?", (alert_id,))
        self._audit("delete", "alert", str(alert_id))
        return {"deleted": alert_id}

    def create_alert(self, data: dict[str, Any]) -> dict:
        alert = Alert(
            timestamp=data.get("timestamp") or datetime.now(timezone.utc),
            severity=data["severity"],
            category=data["category"],
            source_id=data["source_id"],
            message=data["message"],
        )
        self.sqlite.insert_alert(alert)
        aid = self.sqlite._fetchone("SELECT MAX(id) AS id FROM alerts")["id"]
        if data.get("status") and data["status"] != "active":
            self.update_alert(int(aid), {"status": data["status"], "admin_notes": data.get("admin_notes", "")})
        self._audit("create", "alert", str(aid))
        return dict(self.sqlite._fetchone("SELECT * FROM alerts WHERE id = ?", (int(aid),)))

    # —— Incidents fuite ——
    def list_leak_incidents(self, limit: int = 50, status: str | None = None) -> list[dict]:
        if status:
            rows = self.sqlite._fetchall(
                "SELECT * FROM leak_incidents WHERE status = ? ORDER BY id DESC LIMIT ?",
                (status, limit),
            )
        else:
            rows = self.sqlite._fetchall(
                "SELECT * FROM leak_incidents ORDER BY id DESC LIMIT ?",
                (limit,),
            )
        return [dict(r) for r in rows]

    def create_leak_incident(self, data: dict[str, Any]) -> dict:
        now = datetime.now(timezone.utc).isoformat()
        with self.sqlite._lock:
            cur = self.sqlite._conn.execute(
                """
                INSERT INTO leak_incidents(
                    localization_id, zone_id, segment_id, status, detected_at, repaired_at,
                    upstream_meter, downstream_meter, distance_m_from_upstream, meter_source,
                    admin_notes, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    data.get("localization_id"),
                    data.get("zone_id"),
                    data.get("segment_id"),
                    data.get("status", "open"),
                    data.get("detected_at") or now,
                    data.get("repaired_at"),
                    data.get("upstream_meter"),
                    data.get("downstream_meter"),
                    data.get("distance_m_from_upstream"),
                    data.get("meter_source"),
                    data.get("admin_notes") or "",
                    now,
                    now,
                ),
            )
            self.sqlite._conn.commit()
            iid = int(cur.lastrowid)
        self._audit("create", "leak_incident", str(iid), data.get("status", "open"))
        return self.get_leak_incident(iid)

    def get_leak_incident(self, incident_id: int) -> dict:
        row = self.sqlite._fetchone("SELECT * FROM leak_incidents WHERE id = ?", (incident_id,))
        if not row:
            raise ValueError("Incident introuvable")
        return dict(row)

    def update_leak_incident(self, incident_id: int, data: dict[str, Any]) -> dict:
        current = self.get_leak_incident(incident_id)
        now = datetime.now(timezone.utc).isoformat()
        status = data.get("status", current["status"])
        repaired_at = data.get("repaired_at", current.get("repaired_at"))
        if status == "repaired" and not repaired_at:
            repaired_at = now
        self.sqlite._execute_commit(
            """
            UPDATE leak_incidents SET
                status = ?, repaired_at = ?, admin_notes = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                status,
                repaired_at,
                data.get("admin_notes", current.get("admin_notes") or ""),
                now,
                incident_id,
            ),
        )
        self._audit("update", "leak_incident", str(incident_id), status)
        if status == "repaired":
            self.sqlite._execute_commit(
                "UPDATE alerts SET status = 'resolved', resolved_at = ? WHERE category LIKE '%leak%' AND COALESCE(status,'active')='active'",
                (now,),
            )
        return self.get_leak_incident(incident_id)

    def delete_leak_incident(self, incident_id: int) -> dict:
        self.sqlite._execute_commit("DELETE FROM leak_incidents WHERE id = ?", (incident_id,))
        self._audit("delete", "leak_incident", str(incident_id))
        return {"deleted": incident_id}

    def sync_leak_incidents_from_localizations(self) -> int:
        locs = self.sqlite.get_leak_localizations(limit=200)
        created = 0
        for loc in locs:
            if not loc.get("confirmed"):
                continue
            exists = self.sqlite._fetchone(
                "SELECT id FROM leak_incidents WHERE localization_id = ?",
                (loc.get("id"),),
            )
            if exists:
                continue
            self.create_leak_incident(
                {
                    "localization_id": loc.get("id"),
                    "zone_id": loc.get("zone_id"),
                    "segment_id": loc.get("segment_id"),
                    "status": "confirmed",
                    "detected_at": loc.get("timestamp"),
                    "upstream_meter": loc.get("upstream_meter"),
                    "downstream_meter": loc.get("downstream_meter"),
                    "distance_m_from_upstream": loc.get("distance_m_from_upstream"),
                    "meter_source": loc.get("meter_source"),
                    "admin_notes": "Auto-cree depuis localisation capteurs",
                }
            )
            created += 1
        return created

    def audit_log(self, limit: int = 50) -> list[dict]:
        rows = self.sqlite._fetchall(
            "SELECT * FROM admin_audit_log ORDER BY id DESC LIMIT ?",
            (limit,),
        )
        return [dict(r) for r in rows]
