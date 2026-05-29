"""Topologie reseau ~10 km : zones capteurs pression tous les ~300 m sur le plan site."""

from __future__ import annotations

import math
from typing import Any

NETWORK_TOTAL_LENGTH_M = 10_000.0
ZONE_SPACING_M = 300.0
TOPOLOGY_VERSION = 2

# Cheminement du reseau sur le plan (pixels) — troncon principal + branches sud
# (x, y, compteur associe ou None)
BACKBONE_WAYPOINTS: list[tuple[float, float, str | None]] = [
    (230, 520, "AVOGADRO"),
    (290, 500, None),
    (350, 530, "BECQUEREL"),
    (390, 470, "BCA1"),
    (410, 500, "BCA2"),
    (448, 468, None),
    (485, 445, "JOLIOT_CURIE_1"),
    (515, 445, "JOLIOT_CURIE_2"),
    (560, 470, "FARADAY"),
    (590, 462, None),
    (620, 460, "AMPERE_1"),
    (640, 500, "AMPERE_2"),
    (680, 445, "EINSTEIN"),
    (720, 500, "CHARPAK"),
    (740, 420, "FRANKLIN"),
    (770, 480, None),
    (800, 530, "NEWTON"),
    (735, 575, None),
    (700, 620, "PAP"),
    (770, 675, "VOLTA"),
    (680, 695, None),
    (620, 690, "TREMPLIN"),
    (530, 690, "COULOMB2"),
    (450, 690, "COULOMB1"),
    (340, 700, "SALLE_MUSCULATION"),
    (300, 690, "CCAS"),
    (265, 725, "SIMULATEUR"),
    (210, 650, "EDISON"),
    (230, 520, "AVOGADRO"),  # boucle pour couvrir ~10 km sur le plan
]

METER_PLAN_XY: dict[str, dict[str, float]] = {
    "AMPERE_1": {"x": 620, "y": 460},
    "AMPERE_2": {"x": 640, "y": 500},
    "BCA1": {"x": 390, "y": 470},
    "BCA2": {"x": 410, "y": 500},
    "BECQUEREL": {"x": 350, "y": 530},
    "CCAS": {"x": 300, "y": 690},
    "CHARPAK": {"x": 720, "y": 500},
    "EINSTEIN": {"x": 680, "y": 445},
    "SIMULATEUR": {"x": 265, "y": 725},
    "FARADAY": {"x": 560, "y": 470},
    "FRANKLIN": {"x": 740, "y": 420},
    "JOLIOT_CURIE_1": {"x": 485, "y": 445},
    "JOLIOT_CURIE_2": {"x": 515, "y": 445},
    "NEWTON": {"x": 800, "y": 530},
    "PAP": {"x": 700, "y": 620},
    "VOLTA": {"x": 770, "y": 675},
    "AVOGADRO": {"x": 230, "y": 520},
    "EDISON": {"x": 210, "y": 650},
    "COULOMB1": {"x": 450, "y": 690},
    "COULOMB2": {"x": 530, "y": 690},
    "TREMPLIN": {"x": 620, "y": 690},
    "SALLE_MUSCULATION": {"x": 340, "y": 700},
}

ZONE_SHORT_NAMES = [
    "CRT",
    "Entrée BCA",
    "Joliot",
    "FARADAY",
    "AMPERE",
    "TR est",
    "BTE",
    "PAP",
    "VOLTA",
    "Sud 1",
    "Sud 2",
    "Sud 3",
    "Accueil",
]


def _sensors_for_zone(zone_id: int) -> list[str]:
    return [f"S_Z{zone_id:02d}_A", f"S_Z{zone_id:02d}_B"]


def _dist_px(a: tuple[float, float], b: tuple[float, float]) -> float:
    return math.hypot(b[0] - a[0], b[1] - a[1])


def _interp(a: tuple[float, float], b: tuple[float, float], t: float) -> tuple[float, float]:
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


def _point_at_distance(
    polyline: list[tuple[float, float]],
    cumul_m: list[float],
    distance_m: float,
) -> tuple[float, float]:
    if distance_m <= 0:
        return polyline[0]
    if distance_m >= cumul_m[-1]:
        return polyline[-1]
    for i in range(1, len(polyline)):
        if cumul_m[i] >= distance_m:
            seg_len = cumul_m[i] - cumul_m[i - 1]
            if seg_len <= 0:
                return polyline[i]
            t = (distance_m - cumul_m[i - 1]) / seg_len
            return _interp(polyline[i - 1], polyline[i], t)
    return polyline[-1]


def _nearest_meter(x: float, y: float, candidates: list[str]) -> str:
    best = candidates[0]
    best_d = float("inf")
    for mid in candidates:
        pt = METER_PLAN_XY.get(mid)
        if not pt:
            continue
        d = _dist_px((x, y), (pt["x"], pt["y"]))
        if d < best_d:
            best_d = d
            best = mid
    return best


def _build_topology() -> tuple[
    list[dict[str, Any]],
    list[dict[str, Any]],
    dict[int, dict[str, float]],
    dict[str, dict[str, float]],
]:
    polyline = [(w[0], w[1]) for w in BACKBONE_WAYPOINTS]
    seg_px = [_dist_px(polyline[i], polyline[i + 1]) for i in range(len(polyline) - 1)]
    total_px = sum(seg_px)
    scale_m_per_px = NETWORK_TOTAL_LENGTH_M / total_px if total_px > 0 else 1.0

    cumul_m = [0.0]
    for px in seg_px:
        cumul_m.append(cumul_m[-1] + px * scale_m_per_px)

    zone_count = max(2, int(round(NETWORK_TOTAL_LENGTH_M / ZONE_SPACING_M)))
    spacing_m = NETWORK_TOTAL_LENGTH_M / zone_count

    zone_centers: list[tuple[float, float]] = []
    for i in range(zone_count):
        d = min(i * spacing_m, NETWORK_TOTAL_LENGTH_M)
        zone_centers.append(_point_at_distance(polyline, cumul_m, d))

    meter_candidates = [w[2] for w in BACKBONE_WAYPOINTS if w[2]] + list(METER_PLAN_XY.keys())

    zones: list[dict[str, Any]] = []
    segments: list[dict[str, Any]] = []
    zone_plan: dict[int, dict[str, float]] = {}
    sensor_plan: dict[str, dict[str, float]] = {}

    base_lat, base_lng = 48.496, 3.503
    for zid in range(1, zone_count + 1):
        cx, cy = zone_centers[zid - 1]
        short = ZONE_SHORT_NAMES[(zid - 1) % len(ZONE_SHORT_NAMES)]
        zones.append(
            {
                "id": zid,
                "name": f"Zone {zid:02d} - capteurs ~{int((zid - 1) * spacing_m)} m",
                "short_name": f"Z{zid:02d} {short}",
                "lat": base_lat + (zid - 1) * 0.0012,
                "lng": base_lng + (zid - 1) * 0.0015,
            }
        )
        zone_plan[zid] = {"x": round(cx, 1), "y": round(cy, 1)}

    for zid in range(1, zone_count + 1):
        d_start = (zid - 1) * spacing_m
        d_end = min(zid * spacing_m, NETWORK_TOTAL_LENGTH_M)
        start = _point_at_distance(polyline, cumul_m, d_start)
        end = _point_at_distance(polyline, cumul_m, d_end)
        seg_len = d_end - d_start
        up = _nearest_meter(start[0], start[1], meter_candidates)
        down = _nearest_meter(end[0], end[1], meter_candidates)
        if up == down:
            down = meter_candidates[(meter_candidates.index(up) + 1) % len(meter_candidates)]

        seg_id = f"seg_z{zid:02d}"
        sids = _sensors_for_zone(zid)
        segments.append(
            {
                "id": seg_id,
                "zone_id": zid,
                "upstream_meter": up,
                "downstream_meter": down,
                "length_m": round(seg_len, 1),
                "sensor_ids": sids,
                "pipe_material": "steel",
                "pipe_diameter_m": 0.25,
                "pipe_wall_m": 0.008,
                "bulk_modulus_pa": 2.2e9,
                "fluid_density_kg_m3": 1000.0,
                "water_temp_c": 20.0,
            }
        )
        sensor_plan[sids[0]] = {"x": round(_interp(start, end, 0.15)[0], 1), "y": round(_interp(start, end, 0.15)[1], 1)}
        sensor_plan[sids[1]] = {"x": round(_interp(start, end, 0.85)[0], 1), "y": round(_interp(start, end, 0.85)[1], 1)}

    return zones, segments, zone_plan, sensor_plan


(
    NETWORK_ZONES,
    NETWORK_SEGMENTS,
    ZONE_PLAN_XY,
    SENSOR_PLAN_XY,
) = _build_topology()

ZONE_COUNT = len(NETWORK_ZONES)
SENSOR_COUNT = sum(len(s["sensor_ids"]) for s in NETWORK_SEGMENTS)

ZONE_BY_ID = {z["id"]: z for z in NETWORK_ZONES}
SEGMENT_BY_ID = {s["id"]: s for s in NETWORK_SEGMENTS}
SEGMENTS_BY_ZONE = {z["id"]: next(s for s in NETWORK_SEGMENTS if s["zone_id"] == z["id"]) for z in NETWORK_ZONES}
SEGMENTS_BY_METER: dict[str, list[dict[str, Any]]] = {}
for _seg in NETWORK_SEGMENTS:
    for _meter in (_seg["upstream_meter"], _seg["downstream_meter"]):
        SEGMENTS_BY_METER.setdefault(_meter, []).append(_seg)

SENSOR_TO_ZONE: dict[str, int] = {}
SENSOR_TO_SEGMENT: dict[str, str] = {}
for _seg in NETWORK_SEGMENTS:
    for _sid in _seg["sensor_ids"]:
        SENSOR_TO_ZONE[_sid] = _seg["zone_id"]
        SENSOR_TO_SEGMENT[_sid] = _seg["id"]


def resolve_zone_id(zone_label: str) -> int | None:
    raw = (zone_label or "").strip().lower()
    if not raw:
        return None
    for zone in NETWORK_ZONES:
        zid = zone["id"]
        if raw in {str(zid), f"zone {zid}", f"zone{zid}", f"z{zid:02d}"}:
            return zid
        if raw in zone["name"].lower() or raw in zone["short_name"].lower():
            return zid
    return None


def segment_for_zone(zone_id: int) -> dict[str, Any] | None:
    return SEGMENTS_BY_ZONE.get(zone_id)


def segments_for_meter(meter_id: str) -> list[dict[str, Any]]:
    return SEGMENTS_BY_METER.get(meter_id, [])


def interpolate_leak_plan_xy(segment: dict[str, Any], position_ratio: float) -> dict[str, float]:
    zid = segment["zone_id"]
    plan_a = SENSOR_PLAN_XY.get(f"S_Z{zid:02d}_A") or ZONE_PLAN_XY.get(zid, {"x": 500, "y": 500})
    plan_b = SENSOR_PLAN_XY.get(f"S_Z{zid:02d}_B") or ZONE_PLAN_XY.get(zid, {"x": 500, "y": 500})
    t = max(0.0, min(1.0, position_ratio))
    return {
        "x": plan_a["x"] + (plan_b["x"] - plan_a["x"]) * t,
        "y": plan_a["y"] + (plan_b["y"] - plan_a["y"]) * t,
    }


def network_topology_export() -> dict[str, Any]:
    zones = []
    for zone in NETWORK_ZONES:
        seg = SEGMENTS_BY_ZONE[zone["id"]]
        plan = ZONE_PLAN_XY.get(zone["id"], {"x": 500, "y": 500})
        zones.append(
            {
                **zone,
                "plan_x": plan["x"],
                "plan_y": plan["y"],
                "segment": {
                    "id": seg["id"],
                    "upstream_meter": seg["upstream_meter"],
                    "downstream_meter": seg["downstream_meter"],
                    "length_m": seg["length_m"],
                    "sensor_ids": seg["sensor_ids"],
                },
            }
        )
    return {
        "topology_version": TOPOLOGY_VERSION,
        "network_length_m": NETWORK_TOTAL_LENGTH_M,
        "zone_spacing_m": ZONE_SPACING_M,
        "zones": zones,
        "segments": NETWORK_SEGMENTS,
        "zone_count": ZONE_COUNT,
        "sensor_count": SENSOR_COUNT,
    }
