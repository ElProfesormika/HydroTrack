"""Seuils unifies probabilite / score (0-1) -> niveau de risque affiche."""

from __future__ import annotations

import re

# Probabilite de fuite ML (compteurs) et score pression (capteurs)
LEAK_PROB_CAUTION = 0.25
LEAK_PROB_WARNING = 0.50
LEAK_PROB_CRITICAL = 0.75

RISK_ORDER = {"no_data": 0, "normal": 1, "caution": 2, "warning": 3, "critical": 4}

# Valeurs affichees quand seule une alerte existe (pas de ligne anomalies)
SEVERITY_DISPLAY_PROB = {
    "critical": 0.88,
    "warning": 0.62,
    "caution": 0.37,
    "normal": 0.12,
}


def risk_from_probability(probability: float | None) -> str:
    p = float(probability or 0)
    if p >= LEAK_PROB_CRITICAL:
        return "critical"
    if p >= LEAK_PROB_WARNING:
        return "warning"
    if p >= LEAK_PROB_CAUTION:
        return "caution"
    return "normal"


def risk_from_alert_severity(severity: str | None) -> str:
    s = (severity or "").lower()
    if s == "critical":
        return "critical"
    if s == "warning":
        return "warning"
    if s == "caution":
        return "caution"
    return "normal"


def max_risk_level(*levels: str | None) -> str:
    best = "normal"
    for level in levels:
        if not level:
            continue
        if RISK_ORDER.get(level, 0) > RISK_ORDER.get(best, 0):
            best = level
    return best


def probability_from_alert_message(message: str | None) -> float | None:
    """Extrait la probabilite encodee dans le message d'alerte (ingestion ML)."""
    if not message:
        return None
    m = re.search(r"probabilite=(\d+)\s*%", message, re.I)
    if m:
        return min(1.0, int(m.group(1)) / 100.0)
    m = re.search(r"probabilite=(\d+\.?\d*)", message, re.I)
    if m:
        v = float(m.group(1))
        return v if v <= 1.0 else min(1.0, v / 100.0)
    return None


def meter_map_display(
    *,
    anomaly_leak_probability: float | None,
    anomaly_score: float | None,
    has_reading: bool,
    has_anomaly: bool,
    alert: dict | None,
    has_alert: bool,
) -> dict[str, object]:
    """
    Calcule risk_level + leak_probability affichee sur la carte compteurs.

    leak_probability (0-1) = probabilite de fuite ML, alignee sur la couleur.
    anomaly_score (0-100) = indice technique IsolationForest (informatif).
    """
    if not has_reading and not has_anomaly and not has_alert:
        return {
            "risk_level": "no_data",
            "leak_probability": None,
            "anomaly_score": None,
            "risk_source": "none",
        }

    ml_p: float | None = None
    if has_anomaly and anomaly_leak_probability is not None:
        ml_p = float(anomaly_leak_probability)

    alert_p = probability_from_alert_message((alert or {}).get("message")) if alert else None
    if ml_p is None and alert_p is not None:
        ml_p = alert_p

    alert_risk = risk_from_alert_severity((alert or {}).get("severity")) if has_alert else None
    ml_risk = risk_from_probability(ml_p) if ml_p is not None else None

    if ml_p is not None:
        risk = max_risk_level(ml_risk, alert_risk)
        if alert_risk and RISK_ORDER.get(alert_risk, 0) > RISK_ORDER.get(ml_risk or "normal", 0):
            display_p = alert_p if alert_p is not None else SEVERITY_DISPLAY_PROB.get(alert_risk, ml_p)
            source = "alert" if alert_p is not None else "alert_level"
        else:
            display_p = ml_p
            source = "ml"
        return {
            "risk_level": risk,
            "leak_probability": round(display_p, 3),
            "anomaly_score": round(float(anomaly_score), 2) if anomaly_score is not None else None,
            "risk_source": source,
        }

    if has_alert and alert_risk:
        display_p = alert_p if alert_p is not None else SEVERITY_DISPLAY_PROB.get(alert_risk, 0.12)
        return {
            "risk_level": alert_risk,
            "leak_probability": round(display_p, 3),
            "anomaly_score": None,
            "risk_source": "alert" if alert_p is not None else "alert_level",
        }

    return {
        "risk_level": "normal",
        "leak_probability": 0.0,
        "anomaly_score": round(float(anomaly_score), 2) if anomaly_score is not None else None,
        "risk_source": "reading",
    }


# Compatibilite
def meter_map_risk(
    *,
    leak_probability: float | None,
    has_reading: bool,
    has_anomaly: bool,
    alert_severity: str | None,
    has_alert: bool,
) -> tuple[str, float | None]:
    out = meter_map_display(
        anomaly_leak_probability=leak_probability,
        anomaly_score=None,
        has_reading=has_reading,
        has_anomaly=has_anomaly,
        alert={"severity": alert_severity} if has_alert else None,
        has_alert=has_alert,
    )
    return out["risk_level"], out.get("leak_probability")
