"""Resolution des coordonnees plan : compteurs -> capteurs -> zones."""

from __future__ import annotations

from typing import Any

from . import network_topology

UPSTREAM_T = 0.15
DOWNSTREAM_T = 0.85


def resolve_meter_xy(meter: dict[str, Any] | None, meter_id: str | None = None) -> dict[str, float] | None:
    mid = (meter or {}).get("meter_id") or meter_id
    if meter is not None:
        if meter.get("plan_x") is not None and meter.get("plan_y") is not None:
            return {"x": float(meter["plan_x"]), "y": float(meter["plan_y"])}
    if mid:
        xy = network_topology.METER_PLAN_XY.get(mid)
        if xy:
            return {"x": float(xy["x"]), "y": float(xy["y"])}
    return None


def resolve_segment_endpoints(
    meters: list[dict[str, Any]],
    segment: dict[str, Any] | None,
) -> tuple[dict[str, float], dict[str, float]] | None:
    if not segment:
        return None
    by_id = {m["meter_id"]: m for m in meters}
    up = resolve_meter_xy(by_id.get(segment["upstream_meter"]), segment["upstream_meter"])
    down = resolve_meter_xy(by_id.get(segment["downstream_meter"]), segment["downstream_meter"])
    if up and down:
        return up, down
    if up:
        return up, up
    if down:
        return down, down
    return None


def interpolate_plan_xy(a: dict[str, float], b: dict[str, float], t: float) -> dict[str, float]:
    t = max(0.0, min(1.0, t))
    return {
        "x": round(a["x"] + (b["x"] - a["x"]) * t, 1),
        "y": round(a["y"] + (b["y"] - a["y"]) * t, 1),
    }


def sensor_interpolation_t(sensor: dict[str, Any]) -> float:
    role = (sensor.get("role") or "").lower()
    sid = str(sensor.get("sensor_id") or "")
    if role == "downstream" or sid.endswith("_B"):
        return DOWNSTREAM_T
    return UPSTREAM_T


def resolve_sensor_plan_xy(
    sensor: dict[str, Any],
    meters: list[dict[str, Any]],
    segment: dict[str, Any] | None,
) -> dict[str, float]:
    """Capteur : coordonnees en base, sinon interpolation sur le troncon (compteurs)."""
    if sensor.get("plan_x") is not None and sensor.get("plan_y") is not None:
        return {"x": float(sensor["plan_x"]), "y": float(sensor["plan_y"])}
    ends = resolve_segment_endpoints(meters, segment)
    if ends:
        return interpolate_plan_xy(ends[0], ends[1], sensor_interpolation_t(sensor))
    sid = str(sensor.get("sensor_id") or "")
    xy = network_topology.SENSOR_PLAN_XY.get(sid)
    if xy:
        return {"x": float(xy["x"]), "y": float(xy["y"])}
    return {"x": 500.0, "y": 500.0}


def centroid_plan_xy(points: list[dict[str, float]]) -> dict[str, float]:
    if not points:
        return {"x": 500.0, "y": 500.0}
    if len(points) == 1:
        return {"x": points[0]["x"], "y": points[0]["y"]}
    sx = sum(p["x"] for p in points)
    sy = sum(p["y"] for p in points)
    n = len(points)
    return {"x": round(sx / n, 1), "y": round(sy / n, 1)}


def resolve_zone_plan_xy(
    zone: dict[str, Any],
    meters: list[dict[str, Any]],
    segment: dict[str, Any] | None,
    sensors: list[dict[str, Any]] | None = None,
) -> dict[str, float]:
    """Zone : centre des capteurs de la zone, sinon position manuelle / compteurs / reference."""
    zid = int(zone.get("zone_id") or zone.get("id") or 0)
    zone_sensors = [s for s in (sensors or []) if int(s.get("zone_id") or 0) == zid]
    if zone_sensors:
        pts = [resolve_sensor_plan_xy(s, meters, segment) for s in zone_sensors]
        return centroid_plan_xy(pts)
    if zone.get("plan_x") is not None and zone.get("plan_y") is not None:
        return {"x": float(zone["plan_x"]), "y": float(zone["plan_y"])}
    ends = resolve_segment_endpoints(meters, segment)
    if ends:
        return interpolate_plan_xy(ends[0], ends[1], 0.5)
    plan = network_topology.ZONE_PLAN_XY.get(zid)
    if plan:
        return {"x": float(plan["x"]), "y": float(plan["y"])}
    return {"x": 500.0, "y": 500.0}
