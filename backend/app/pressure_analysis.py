"""Analyse des ondes de pression transitoires : confirmation et localisation sur troncon."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from .models import PressureDataIn
from .network_topology import (
    interpolate_leak_plan_xy,
    segment_for_zone,
    segments_for_meter,
)
from .wave_propagation import (
    localize_leak_on_segment,
    transient_leak_signature,
    wave_speed_for_segment,
)

# Seuils confirmation / localisation
PRESSURE_LEAK_SCORE_CONFIRM = 0.52
CORRELATION_MIN = 0.28
METER_LEAK_PROB_CONFIRM = 0.45
TRANSIENT_MIN_FOR_CONFIRM = 0.38


def pressure_leak_score(intensity: float, frequency: float, pressure_signal: float) -> float:
    """Score 0-1 de suspicion de fuite / onde transitoire a partir du signal pression."""
    i = max(0.0, float(intensity)) / 100.0
    f = max(0.0, float(frequency)) / 25.0
    p = min(1.0, abs(float(pressure_signal)) / 3.0)
    return min(1.0, i * 0.45 + f * 0.3 + p * 0.25)


def correlate_sensor_readings(reading_a: dict[str, Any], reading_b: dict[str, Any]) -> float:
    """Correlation inter-capteurs (coherence de l'onde transitoire sur le troncon)."""
    ia = float(reading_a.get("intensity") or 0)
    ib = float(reading_b.get("intensity") or 0)
    fa = float(reading_a.get("frequency") or 0)
    fb = float(reading_b.get("frequency") or 0)
    pa = abs(float(reading_a.get("pressure_signal") or 0))
    pb = abs(float(reading_b.get("pressure_signal") or 0))
    if ia + ib < 1e-6:
        return 0.0
    di = 1.0 - abs(ia - ib) / max(ia, ib, 1.0)
    df = 1.0 - abs(fa - fb) / max(fa, fb, 1.0) if fa + fb > 1e-6 else 0.5
    dp = 1.0 - abs(pa - pb) / max(pa, pb, 1e-6) if pa + pb > 1e-6 else 0.5
    return max(0.0, min(1.0, (di * 0.45 + df * 0.3 + dp * 0.25)))


def confirm_leak(
    *,
    meter_leak_probability: float | None,
    sensor_scores: list[float],
    correlation: float,
    transient_score: float = 0.0,
) -> tuple[bool, float]:
    """
    Confirmer une fuite : compteur ML + retour capteurs pression (onde transitoire) + correlation.
    """
    meter_signal = float(meter_leak_probability or 0) >= METER_LEAK_PROB_CONFIRM
    max_sensor = max(sensor_scores) if sensor_scores else 0.0
    pressure_signal = max_sensor >= PRESSURE_LEAK_SCORE_CONFIRM
    correlated = correlation >= CORRELATION_MIN
    transient_ok = transient_score >= TRANSIENT_MIN_FOR_CONFIRM

    if meter_signal and pressure_signal and correlated and transient_ok:
        confidence = min(
            1.0,
            (meter_leak_probability or 0) * 0.4 + max_sensor * 0.3 + correlation * 0.15 + transient_score * 0.15,
        )
        return True, round(confidence, 3)
    if pressure_signal and correlated and transient_ok and max_sensor >= 0.65:
        return True, round(max_sensor * 0.55 + correlation * 0.25 + transient_score * 0.2, 3)
    if meter_signal and max_sensor >= 0.4 and correlated:
        return False, round(max(meter_leak_probability or 0, max_sensor) * 0.5, 3)
    return False, round(max(max_sensor, float(meter_leak_probability or 0)) * 0.4, 3)


def estimate_leak_distance(
    segment: dict[str, Any],
    reading_upstream: dict[str, Any],
    reading_downstream: dict[str, Any],
) -> tuple[float, float, float, dict[str, Any]]:
    """
    Localisation physique : x = (L + c * delta_t) / 2 avec c = f(K, E, D, e).
    Retourne (distance_m, position_ratio, confidence, details).
    """
    loc = localize_leak_on_segment(segment, reading_upstream, reading_downstream)
    return (
        float(loc["distance_m_from_upstream"]),
        float(loc["position_ratio"]),
        float(loc["localization_confidence"]),
        loc,
    )


def analyze_pressure_event(
    payload: PressureDataIn,
    zone_id: int,
    segment: dict[str, Any],
    sensor_readings: dict[str, dict[str, Any]],
    meter_context: dict[str, Any] | None,
) -> dict[str, Any]:
    """Pipeline : signature transitoire, confirmation capteurs, localisation par onde."""
    score = pressure_leak_score(payload.intensity, payload.frequency, payload.pressure_signal)
    sensor_scores = [
        pressure_leak_score(
            float(r.get("intensity") or 0),
            float(r.get("frequency") or 0),
            float(r.get("pressure_signal") or 0),
        )
        for r in sensor_readings.values()
    ]

    ids = segment.get("sensor_ids") or []
    correlation = 0.0
    transient = {"transient_score": 0.0}
    if len(ids) >= 2 and ids[0] in sensor_readings and ids[1] in sensor_readings:
        up = sensor_readings[ids[0]]
        down = sensor_readings[ids[1]]
        correlation = correlate_sensor_readings(up, down)
        transient = transient_leak_signature(up, down)

    meter_prob = None
    if meter_context:
        meter_prob = float(meter_context.get("leak_probability") or 0)

    confirmed, confirm_conf = confirm_leak(
        meter_leak_probability=meter_prob,
        sensor_scores=sensor_scores + [score],
        correlation=correlation if correlation > 0 else 0.35,
        transient_score=float(transient.get("transient_score") or 0),
    )

    wave_ctx = wave_speed_for_segment(segment)

    result: dict[str, Any] = {
        "zone_id": zone_id,
        "segment_id": segment["id"],
        "pressure_leak_score": round(score, 3),
        "sensor_correlation": round(correlation, 3),
        "transient_score": transient.get("transient_score", 0),
        "confirmed": confirmed,
        "confirmation_confidence": confirm_conf,
        "meter_context": meter_context,
        "wave_speed_m_s": wave_ctx["wave_speed_m_s"],
        "pipe_material": wave_ctx.get("pipe_material"),
        "pipe_material_label": wave_ctx.get("pipe_material_label"),
        "fluid_impedance": wave_ctx.get("fluid_impedance"),
        "wall_impedance": wave_ctx.get("wall_impedance"),
        "bulk_modulus_pa": wave_ctx.get("bulk_modulus_pa"),
        "localization_formula": "x = (L + c * Δt) / 2",
    }

    if confirmed and len(ids) >= 2:
        up_reading = sensor_readings.get(ids[0], sensor_readings.get(payload.sensor_id, {}))
        down_reading = sensor_readings.get(ids[1], up_reading)
        distance_m, position_ratio, loc_conf, loc_details = estimate_leak_distance(
            segment, up_reading, down_reading
        )
        plan_xy = interpolate_leak_plan_xy(segment, position_ratio)
        result.update(
            {
                "distance_m_from_upstream": distance_m,
                "segment_length_m": float(segment["length_m"]),
                "position_ratio": position_ratio,
                "localization_confidence": loc_conf,
                "plan_x": plan_xy["x"],
                "plan_y": plan_xy["y"],
                "upstream_meter": segment["upstream_meter"],
                "downstream_meter": segment["downstream_meter"],
                "delta_t_s": loc_details.get("delta_t_s"),
                "delta_t_method": loc_details.get("delta_t_method"),
                "leak_radius_m": loc_details.get("leak_radius_m"),
                "localization_physics": loc_details.get("physics"),
                "localization_transient": loc_details.get("transient"),
            }
        )

    return result


def pending_meter_context_for_zone(zone_id: int, pending_by_meter: dict[str, dict[str, Any]]) -> dict[str, Any] | None:
    seg = segment_for_zone(zone_id)
    if not seg:
        return None
    for meter_id in (seg["upstream_meter"], seg["downstream_meter"]):
        ctx = pending_by_meter.get(meter_id)
        if ctx:
            return ctx
    return None


def register_meter_suspicion(meter_id: str, leak_probability: float, timestamp: datetime) -> list[int]:
    """Retourne les zone_id impactees par une suspicion compteur."""
    return [seg["zone_id"] for seg in segments_for_meter(meter_id)]


def build_localization_record(analysis: dict[str, Any], sensor_id: str, timestamp: datetime) -> dict[str, Any]:
    return {
        "timestamp": timestamp.isoformat(),
        "zone_id": analysis["zone_id"],
        "segment_id": analysis["segment_id"],
        "upstream_meter": analysis.get("upstream_meter"),
        "downstream_meter": analysis.get("downstream_meter"),
        "confirmed": bool(analysis.get("confirmed")),
        "confirmation_confidence": analysis.get("confirmation_confidence", 0),
        "distance_m_from_upstream": analysis.get("distance_m_from_upstream"),
        "segment_length_m": analysis.get("segment_length_m"),
        "position_ratio": analysis.get("position_ratio"),
        "localization_confidence": analysis.get("localization_confidence"),
        "plan_x": analysis.get("plan_x"),
        "plan_y": analysis.get("plan_y"),
        "pressure_leak_score": analysis.get("pressure_leak_score"),
        "sensor_correlation": analysis.get("sensor_correlation"),
        "trigger_sensor_id": sensor_id,
        "meter_source": (analysis.get("meter_context") or {}).get("meter_id"),
        "wave_speed_m_s": analysis.get("wave_speed_m_s"),
        "delta_t_s": analysis.get("delta_t_s"),
        "delta_t_method": analysis.get("delta_t_method"),
        "transient_score": analysis.get("transient_score"),
        "pipe_material": analysis.get("pipe_material"),
        "leak_radius_m": analysis.get("leak_radius_m"),
    }


def localization_alert_message(record: dict[str, Any]) -> str:
    zone_id = record.get("zone_id")
    if not record.get("confirmed"):
        return f"Signal pression transitoire zone {zone_id} — confirmation capteurs en attente"
    dist = record.get("distance_m_from_upstream")
    length = record.get("segment_length_m")
    up = record.get("upstream_meter", "?")
    c = record.get("wave_speed_m_s")
    dt = record.get("delta_t_s")
    conf = record.get("localization_confidence", 0)
    radius = record.get("leak_radius_m")
    extra = ""
    if c is not None:
        extra = f" — c={c:.0f} m/s"
        if dt is not None:
            extra += f", Δt={float(dt) * 1000:.1f} ms"
    zone_txt = f" (zone estimee R≈{radius:.0f} m)" if radius is not None else ""
    return (
        f"Fuite confirmee (onde transitoire) zone {zone_id} : {dist:.0f} m depuis {up} "
        f"sur troncon {length:.0f} m (confiance {conf:.0%}{zone_txt}{extra})"
    )
