"""Registre reseau dynamique (compteurs, zones, capteurs, troncons) charge depuis SQLite."""

from __future__ import annotations

from typing import Any

from . import network_config
from . import network_topology
from . import plan_coordinates


class NetworkRegistry:
    def __init__(self) -> None:
        self.meters: list[dict[str, Any]] = []
        self.zones: list[dict[str, Any]] = []
        self.segments: list[dict[str, Any]] = []
        self.sensors: list[dict[str, Any]] = []
        self._meter_ids: list[str] = []
        self._meter_labels: dict[str, str] = {}
        self._zone_by_id: dict[int, dict[str, Any]] = {}
        self._segment_by_id: dict[str, dict[str, Any]] = {}
        self._segments_by_zone: dict[int, dict[str, Any]] = {}
        self._segments_by_meter: dict[str, list[dict[str, Any]]] = {}
        self._sensor_to_zone: dict[str, int] = {}
        self._sensor_to_segment: dict[str, str] = {}

    def load_from_rows(
        self,
        meters: list[dict[str, Any]],
        zones: list[dict[str, Any]],
        segments: list[dict[str, Any]],
        sensors: list[dict[str, Any]],
    ) -> None:
        self.meters = [m for m in meters if m.get("active", 1)]
        self.zones = [z for z in zones if z.get("active", 1)]
        self.segments = [s for s in segments if s.get("active", 1)]
        self.sensors = [s for s in sensors if s.get("active", 1)]
        self._rebuild_indexes()

    def load_defaults(self) -> None:
        meters = []
        for idx, meter_id in enumerate(network_config.NETWORK_METER_IDS):
            xy = network_topology.METER_PLAN_XY.get(meter_id, {"x": 500, "y": 500})
            meters.append(
                {
                    "meter_id": meter_id,
                    "name": network_config.NETWORK_METER_LABELS.get(meter_id, meter_id),
                    "plan_x": xy["x"],
                    "plan_y": xy["y"],
                    "lat": None,
                    "lng": None,
                    "active": 1,
                    "notes": "",
                }
            )
        zones = []
        for zone in network_topology.NETWORK_ZONES:
            zid = zone["id"]
            plan = network_topology.ZONE_PLAN_XY.get(zid, {"x": 500, "y": 500})
            zones.append(
                {
                    "zone_id": zid,
                    "name": zone["name"],
                    "short_name": zone["short_name"],
                    "plan_x": plan["x"],
                    "plan_y": plan["y"],
                    "lat": zone.get("lat"),
                    "lng": zone.get("lng"),
                    "active": 1,
                    "notes": "",
                }
            )
        segments = [
            {
                "segment_id": s["id"],
                "zone_id": s["zone_id"],
                "upstream_meter": s["upstream_meter"],
                "downstream_meter": s["downstream_meter"],
                "length_m": s["length_m"],
                "pipe_material": s.get("pipe_material"),
                "pipe_diameter_m": s.get("pipe_diameter_m"),
                "pipe_wall_m": s.get("pipe_wall_m"),
                "bulk_modulus_pa": s.get("bulk_modulus_pa"),
                "fluid_density_kg_m3": s.get("fluid_density_kg_m3"),
                "water_temp_c": s.get("water_temp_c"),
                "active": 1,
                "notes": "",
            }
            for s in network_topology.NETWORK_SEGMENTS
        ]
        sensors = []
        for seg in network_topology.NETWORK_SEGMENTS:
            for sid in seg["sensor_ids"]:
                role = "upstream" if sid.endswith("_A") else "downstream"
                xy = network_topology.SENSOR_PLAN_XY.get(sid, {"x": 500, "y": 500})
                sensors.append(
                    {
                        "sensor_id": sid,
                        "zone_id": seg["zone_id"],
                        "segment_id": seg["id"],
                        "role": role,
                        "name": sid.replace("_", " "),
                        "plan_x": xy["x"],
                        "plan_y": xy["y"],
                        "active": 1,
                        "notes": "",
                    }
                )
        self.load_from_rows(meters, zones, segments, sensors)

    def _rebuild_indexes(self) -> None:
        self._meter_ids = [m["meter_id"] for m in self.meters]
        self._meter_labels = {m["meter_id"]: m.get("name") or m["meter_id"] for m in self.meters}
        self._zone_by_id = {int(z["zone_id"]): z for z in self.zones}
        self._segment_by_id = {s["segment_id"]: s for s in self.segments}
        self._segments_by_zone = {int(s["zone_id"]): s for s in self.segments}
        self._segments_by_meter = {}
        for seg in self.segments:
            for mid in (seg["upstream_meter"], seg["downstream_meter"]):
                self._segments_by_meter.setdefault(mid, []).append(seg)
        self._sensor_to_zone = {s["sensor_id"]: int(s["zone_id"]) for s in self.sensors}
        self._sensor_to_segment = {s["sensor_id"]: s.get("segment_id") or "" for s in self.sensors}

    @property
    def meter_ids(self) -> list[str]:
        return list(self._meter_ids)

    def meter_labels(self) -> dict[str, str]:
        return dict(self._meter_labels)

    def zone_by_id(self, zone_id: int) -> dict[str, Any] | None:
        return self._zone_by_id.get(zone_id)

    def segment_for_zone(self, zone_id: int) -> dict[str, Any] | None:
        return self._segments_by_zone.get(zone_id)

    def segment_by_id(self, segment_id: str) -> dict[str, Any] | None:
        return self._segment_by_id.get(segment_id)

    def segments_for_meter(self, meter_id: str) -> list[dict[str, Any]]:
        return self._segments_by_meter.get(meter_id, [])

    def sensor_zone_id(self, sensor_id: str) -> int | None:
        return self._sensor_to_zone.get(sensor_id)

    def export_topology(self) -> dict[str, Any]:
        zones_out = []
        for zone in self.zones:
            zid = int(zone["zone_id"])
            seg = self._segments_by_zone.get(zid)
            zones_out.append(
                {
                    "id": zid,
                    "name": zone["name"],
                    "short_name": zone.get("short_name"),
                    "lat": zone.get("lat"),
                    "lng": zone.get("lng"),
                    "plan_x": zone.get("plan_x"),
                    "plan_y": zone.get("plan_y"),
                    "segment": (
                        {
                            "id": seg["segment_id"],
                            "upstream_meter": seg["upstream_meter"],
                            "downstream_meter": seg["downstream_meter"],
                            "length_m": seg["length_m"],
                            "sensor_ids": [s["sensor_id"] for s in self.sensors if int(s["zone_id"]) == zid],
                        }
                        if seg
                        else None
                    ),
                }
            )
        return {
            "zones": zones_out,
            "segments": self.segments,
            "meters": self.meters,
            "sensors": self.sensors,
            "sensor_count": len(self.sensors),
        }

    def resolve_zone_id(self, zone_label: str) -> int | None:
        raw = (zone_label or "").strip().lower()
        if not raw:
            return None
        for zone in self.zones:
            zid = int(zone["zone_id"])
            if raw in {str(zid), f"zone {zid}", f"zone{zid}"}:
                return zid
            if raw in (zone.get("name") or "").lower() or raw in (zone.get("short_name") or "").lower():
                return zid
        return None

    def interpolate_leak_plan_xy(self, segment: dict[str, Any], position_ratio: float) -> dict[str, float]:
        ends = plan_coordinates.resolve_segment_endpoints(self.meters, segment)
        if not ends:
            zid = int(segment["zone_id"])
            zone = self._zone_by_id.get(zid, {})
            plan = plan_coordinates.resolve_zone_plan_xy(zone, self.meters, segment, self.sensors)
            return {"x": plan["x"], "y": plan["y"]}
        return plan_coordinates.interpolate_plan_xy(ends[0], ends[1], position_ratio)
