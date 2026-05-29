"""
Modele physique de propagation d'ondes de pression transitoires (eau en conduite).

References : normes hydrauliques (K eau ~2.2 GPa a 20 C), modules de Young (acier, fonte, PVC, PEHD).

Formules :
  - Vitesse d'onde : c = sqrt( (K/rho) / (1 + (K*D)/(E*e)) )  [m/s]
  - Position fuite entre 2 capteurs : x = (L + c * delta_t) / 2  [m depuis amont]
  - Impedance fluide : Z_f = rho * c
  - Impedance paroi (approx.) : Z_p = sqrt(E * rho_p)
"""

from __future__ import annotations

import math
from datetime import datetime
from typing import Any

# Module de compressibilite eau potable ~20 C (Pa) — valeur litterature / modeles industriels
K_WATER_20C_PA = 2.2e9
RHO_WATER_KG_M3 = 1000.0

# Module de Young (Pa) et densite paroi (kg/m3) — normes ISO / EN / ASM Handbook
PIPE_MATERIALS: dict[str, dict[str, float]] = {
    "steel": {"E": 2.05e11, "rho_p": 7850.0, "label": "Acier"},
    "cast_iron": {"E": 1.4e11, "rho_p": 7200.0, "label": "Fonte"},
    "pvc": {"E": 3.0e9, "rho_p": 1400.0, "label": "PVC"},
    "pehd": {"E": 1.0e9, "rho_p": 950.0, "label": "PEHD"},
}

DEFAULT_PIPE_MATERIAL = "steel"
DEFAULT_PIPE_DIAMETER_M = 0.25
DEFAULT_PIPE_WALL_M = 0.008
DEFAULT_WATER_TEMP_C = 20.0


def segment_pipe_properties(segment: dict[str, Any] | None) -> dict[str, Any]:
    """Proprietes geometriques / materiau d'un troncon (defauts reseau eau potable acier)."""
    seg = segment or {}
    material = str(seg.get("pipe_material") or DEFAULT_PIPE_MATERIAL).lower().strip()
    if material not in PIPE_MATERIALS:
        material = DEFAULT_PIPE_MATERIAL
    mat = PIPE_MATERIALS[material]
    D = float(seg.get("pipe_diameter_m") or DEFAULT_PIPE_DIAMETER_M)
    e = float(seg.get("pipe_wall_m") or DEFAULT_PIPE_WALL_M)
    K = float(seg.get("bulk_modulus_pa") or K_WATER_20C_PA)
    rho = float(seg.get("fluid_density_kg_m3") or RHO_WATER_KG_M3)
    return {
        "pipe_material": material,
        "pipe_material_label": mat["label"],
        "pipe_diameter_m": D,
        "pipe_wall_m": e,
        "bulk_modulus_pa": K,
        "young_modulus_pa": mat["E"],
        "pipe_density_kg_m3": mat["rho_p"],
        "fluid_density_kg_m3": rho,
        "water_temp_c": float(seg.get("water_temp_c") or DEFAULT_WATER_TEMP_C),
    }


def wave_speed_m_s(
    *,
    bulk_modulus_pa: float = K_WATER_20C_PA,
    young_modulus_pa: float,
    diameter_m: float,
    wall_thickness_m: float,
    fluid_density_kg_m3: float = RHO_WATER_KG_M3,
) -> float:
    """
    Vitesse de propagation de l'onde de surpression (m/s).
    c = sqrt( (K/rho) / (1 + (K*D)/(E*e)) )
    """
    K = max(bulk_modulus_pa, 1.0)
    E = max(young_modulus_pa, 1.0)
    D = max(diameter_m, 1e-4)
    e = max(wall_thickness_m, 1e-5)
    rho = max(fluid_density_kg_m3, 1.0)
    term_fluid = K / rho
    term_pipe = (K * D) / (E * e)
    return float(math.sqrt(term_fluid / (1.0 + term_pipe)))


def wave_speed_for_segment(segment: dict[str, Any] | None) -> dict[str, Any]:
    props = segment_pipe_properties(segment)
    c = wave_speed_m_s(
        bulk_modulus_pa=props["bulk_modulus_pa"],
        young_modulus_pa=props["young_modulus_pa"],
        diameter_m=props["pipe_diameter_m"],
        wall_thickness_m=props["pipe_wall_m"],
        fluid_density_kg_m3=props["fluid_density_kg_m3"],
    )
    z_f = fluid_acoustic_impedance(props["fluid_density_kg_m3"], c)
    z_p = wall_acoustic_impedance(props["young_modulus_pa"], props["pipe_density_kg_m3"])
    return {**props, "wave_speed_m_s": round(c, 1), "fluid_impedance": round(z_f, 0), "wall_impedance": round(z_p, 0)}


def fluid_acoustic_impedance(fluid_density_kg_m3: float, wave_speed_m_s: float) -> float:
    """Z_f = rho * c (kg/m2/s)."""
    return float(fluid_density_kg_m3) * float(wave_speed_m_s)


def wall_acoustic_impedance(young_modulus_pa: float, pipe_density_kg_m3: float) -> float:
    """Z_p ~ sqrt(E * rho_p) — approximation impedance paroi."""
    return float(math.sqrt(max(young_modulus_pa, 1.0) * max(pipe_density_kg_m3, 1.0)))


def leak_position_from_transit(
    segment_length_m: float,
    wave_speed_m_s: float,
    delta_t_s: float,
) -> tuple[float, float]:
    """
    x = (L + c * delta_t) / 2
    Retourne (distance depuis amont en m, ratio 0-1).
    """
    L = max(float(segment_length_m), 1.0)
    c = max(float(wave_speed_m_s), 1.0)
    dt = float(delta_t_s)
    x = (L + c * dt) / 2.0
    x_clamped = max(0.0, min(L, x))
    return round(x_clamped, 2), round(x_clamped / L, 4)


def parse_timestamp(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def estimate_arrival_time_delta_s(
    reading_upstream: dict[str, Any],
    reading_downstream: dict[str, Any],
) -> tuple[float | None, str, float]:
    """
    Estime delta_t (s) entre capteurs amont/aval.
    Priorite : timestamps si ecart > 1 ms, sinon heuristique amplitude (onde plus forte = arrivee plus tot).
    Retourne (delta_t, method, confidence 0-1).
    """
    ts_a = parse_timestamp(reading_upstream.get("timestamp"))
    ts_b = parse_timestamp(reading_downstream.get("timestamp"))
    if ts_a and ts_b:
        dt_raw = (ts_b - ts_a).total_seconds()
        if abs(dt_raw) >= 0.001:
            # delta_t signe : positif si l'onde arrive d'abord en aval
            return round(dt_raw, 6), "timestamp", min(1.0, 0.5 + min(abs(dt_raw), 2.0) * 0.2)

    ia = float(reading_upstream.get("intensity") or 0)
    ib = float(reading_downstream.get("intensity") or 0)
    fa = float(reading_upstream.get("frequency") or 0)
    fb = float(reading_downstream.get("frequency") or 0)
    pa = float(reading_upstream.get("pressure_signal") or 0)
    pb = float(reading_downstream.get("pressure_signal") or 0)

    # Proxy : fuite plus proche du capteur qui voit le signal transitoire le plus fort
    strength_a = ia * 0.5 + fa * 0.3 + abs(pa) * 0.2
    strength_b = ib * 0.5 + fb * 0.3 + abs(pb) * 0.2
    total = strength_a + strength_b
    if total < 1e-6:
        return None, "none", 0.2

    # delta_t synthetique : +/- fraction de L/c simulee par desequilibre d'amplitude
    imbalance = (strength_b - strength_a) / total
    pseudo_dt = imbalance * 0.05  # jusqu'a 50 ms equivalent
    conf = min(1.0, 0.3 + abs(imbalance) * 0.45)
    return round(pseudo_dt, 6), "amplitude_proxy", conf


def transient_leak_signature(
    reading_upstream: dict[str, Any],
    reading_downstream: dict[str, Any],
) -> dict[str, Any]:
    """Indice de signature d'onde transitoire (pression + correlation inter-capteurs)."""
    ia = float(reading_upstream.get("intensity") or 0)
    ib = float(reading_downstream.get("intensity") or 0)
    pa = abs(float(reading_upstream.get("pressure_signal") or 0))
    pb = abs(float(reading_downstream.get("pressure_signal") or 0))
    transient_score = min(1.0, (max(ia, ib) / 80.0) * 0.5 + (pa + pb) / 6.0 * 0.5)
    correlated = 1.0 - abs(ia - ib) / max(ia, ib, 1.0) if ia + ib > 1e-6 else 0.0
    return {
        "transient_score": round(transient_score, 3),
        "pressure_transient": round((pa + pb) / 2.0, 3),
        "intensity_balance": round(correlated, 3),
    }


def estimate_leak_zone_radius_m(
    segment_length_m: float,
    localization_confidence: float,
    delta_t_method: str | None,
    *,
    wave_speed_m_s: float | None = None,
    delta_t_s: float | None = None,
) -> float:
    """
    Rayon estime (m) de la zone de fuite — tres reduite autour du point x.

    Combine l'incertitude temporelle (c * delta_t_err / 2) et la confiance de localisation.
    """
    L = max(float(segment_length_m), 1.0)
    conf = max(0.0, min(1.0, float(localization_confidence or 0)))
    c = max(float(wave_speed_m_s or 1200.0), 1.0)

    dt_err = {
        "timestamp": 0.002,
        "amplitude_proxy": 0.012,
        "amplitude_fallback": 0.022,
        "none": 0.018,
    }.get(str(delta_t_method or "none"), 0.015)

    spread_physics = (c * dt_err) / 2.0
    spread_confidence = (1.0 - conf) * L * 0.10
    radius = spread_physics + spread_confidence

    r_min = 3.0
    r_max = min(L * 0.15, 40.0)
    return round(max(r_min, min(r_max, radius)), 1)


def localize_leak_on_segment(
    segment: dict[str, Any],
    reading_upstream: dict[str, Any],
    reading_downstream: dict[str, Any],
) -> dict[str, Any]:
    """
    Pipeline complet : c, delta_t, x, impedances, confiance.
    """
    length_m = float(segment.get("length_m") or 100.0)
    physics = wave_speed_for_segment(segment)
    c = physics["wave_speed_m_s"]
    delta_t, dt_method, dt_conf = estimate_arrival_time_delta_s(reading_upstream, reading_downstream)
    signature = transient_leak_signature(reading_upstream, reading_downstream)

    if delta_t is not None:
        distance_m, position_ratio = leak_position_from_transit(length_m, c, delta_t)
        loc_conf = min(1.0, dt_conf * 0.55 + signature["transient_score"] * 0.45)
    else:
        ia = float(reading_upstream.get("intensity") or 0)
        ib = float(reading_downstream.get("intensity") or 0)
        total = ia + ib
        position_ratio = ib / total if total > 1e-6 else 0.5
        distance_m = length_m * position_ratio
        loc_conf = min(1.0, 0.25 + signature["transient_score"] * 0.35)
        dt_method = "amplitude_fallback"

    return {
        "distance_m_from_upstream": distance_m,
        "position_ratio": position_ratio,
        "localization_confidence": round(loc_conf, 3),
        "leak_radius_m": estimate_leak_zone_radius_m(
            length_m,
            loc_conf,
            dt_method,
            wave_speed_m_s=c,
            delta_t_s=delta_t,
        ),
        "wave_speed_m_s": c,
        "delta_t_s": delta_t,
        "delta_t_method": dt_method,
        "segment_length_m": length_m,
        "physics": physics,
        "transient": signature,
        "formula": "x = (L + c * Δt) / 2",
    }
