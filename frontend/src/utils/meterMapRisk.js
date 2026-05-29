import {
  LEAK_PROB_CAUTION,
  LEAK_PROB_CRITICAL,
  LEAK_PROB_WARNING,
  riskFromAlertSeverity,
  riskFromProbability,
  riskLabelWithProbability,
  maxRiskLevel,
} from "./riskThresholds";

const SEVERITY_DISPLAY_PROB = {
  critical: 0.88,
  warning: 0.62,
  caution: 0.37,
  normal: 0.12,
};

function isActiveAlert(alert) {
  if (!alert) return false;
  const status = String(alert.status || "active").toLowerCase();
  return status === "active" || status === "";
}

function latestAnomalyForMeter(meterId, anomalies, meter) {
  const rows = (anomalies || []).filter((a) => a.meter_id === meterId);
  if (rows.length) {
    return rows.reduce((best, cur) => {
      const tb = new Date(best.timestamp || 0).getTime();
      const tc = new Date(cur.timestamp || 0).getTime();
      return tc >= tb ? cur : best;
    });
  }
  return meter?.latest_anomaly || null;
}

function latestAlertForMeter(meterId, alerts, meter) {
  const rows = (alerts || []).filter((a) => a.source_id === meterId && isActiveAlert(a));
  if (rows.length) {
    return rows.reduce((best, cur) => {
      const tb = new Date(best.timestamp || 0).getTime();
      const tc = new Date(cur.timestamp || 0).getTime();
      return tc >= tb ? cur : best;
    });
  }
  const embedded = meter?.latest_alert;
  return isActiveAlert(embedded) ? embedded : null;
}

function probabilityFromAlertMessage(message) {
  if (!message) return null;
  const pct = message.match(/probabilite=(\d+)\s*%/i);
  if (pct) return Math.min(1, Number(pct[1]) / 100);
  const dec = message.match(/probabilite=(\d+\.?\d*)/i);
  if (dec) {
    const v = Number(dec[1]);
    return v <= 1 ? v : Math.min(1, v / 100);
  }
  return null;
}

/**
 * Calcule affichage carte — recopie la logique API meter_map_display.
 * Priorite aux champs /api/map/meters quand presents.
 */
function computeMeterMapDisplay(meter, anom, alert) {
  const hasReading = Boolean(meter.last_reading_at);
  const hasAnomaly = Boolean(anom);
  const hasAlert = Boolean(alert);
  const hasData =
    meter.has_data != null ? Boolean(meter.has_data) : hasReading || hasAnomaly || hasAlert;

  if (!hasData) {
    return {
      risk: "no_data",
      displayProbability: null,
      anomalyScore: null,
      riskSource: "none",
    };
  }

  let mlP = hasAnomaly ? Number(anom.leak_probability) : null;
  if (mlP == null || Number.isNaN(mlP)) mlP = null;

  const alertP = alert ? probabilityFromAlertMessage(alert.message) : null;
  if (mlP == null && alertP != null) mlP = alertP;

  const alertRisk = hasAlert ? riskFromAlertSeverity(alert.severity) : null;
  const mlRisk = mlP != null ? riskFromProbability(mlP) : null;

  if (mlP != null) {
    const risk = maxRiskLevel(mlRisk, alertRisk);
    let displayP = mlP;
    let riskSource = "ml";
    if (alertRisk && (riskFromProbability(mlP) !== risk)) {
      displayP = alertP != null ? alertP : SEVERITY_DISPLAY_PROB[alertRisk] ?? mlP;
      riskSource = alertP != null ? "alert" : "alert_level";
    }
    return {
      risk,
      displayProbability: displayP,
      anomalyScore: anom?.score != null ? Number(anom.score) : meter.anomaly_score ?? null,
      riskSource,
    };
  }

  if (hasAlert) {
    const risk = alertRisk || "normal";
    const displayP = alertP != null ? alertP : SEVERITY_DISPLAY_PROB[risk] ?? 0.12;
    return { risk, displayProbability: displayP, anomalyScore: null, riskSource: "alert" };
  }

  return {
    risk: "normal",
    displayProbability: 0,
    anomalyScore: null,
    riskSource: "reading",
  };
}

export function resolveMeterMapRisk(meter, anomalies, alerts) {
  const anom = latestAnomalyForMeter(meter.meter_id, anomalies, meter);
  const alert = latestAlertForMeter(meter.meter_id, alerts, meter);

  const hasData =
    meter.has_data != null
      ? Boolean(meter.has_data)
      : Boolean(meter.last_reading_at) || anom || alert;

  if (!hasData) {
    return {
      risk: "no_data",
      anom: null,
      alert: null,
      leakP: null,
      displayProbability: null,
      anomalyScore: null,
      riskSource: "none",
      hasData: false,
      riskLabel: riskLabelWithProbability("no_data", null),
    };
  }

  // Champs calcules cote API (/api/map/meters) = reference
  if (
    meter.risk_level &&
    meter.risk_level !== "no_data" &&
    meter.leak_probability != null &&
    !Number.isNaN(Number(meter.leak_probability))
  ) {
    const displayP = Number(meter.leak_probability);
    const risk = meter.risk_level;
    return {
      risk,
      anom,
      alert,
      leakP: displayP,
      displayProbability: displayP,
      anomalyScore: meter.anomaly_score ?? anom?.score ?? null,
      riskSource: meter.risk_source || "ml",
      hasData: true,
      riskLabel: riskLabelWithProbability(risk, displayP),
    };
  }

  const computed = computeMeterMapDisplay(meter, anom, alert);
  const displayP = computed.displayProbability;

  return {
    risk: computed.risk,
    anom,
    alert,
    leakP: displayP ?? 0,
    displayProbability: displayP,
    anomalyScore: computed.anomalyScore,
    riskSource: computed.riskSource,
    hasData: true,
    riskLabel: riskLabelWithProbability(computed.risk, displayP),
  };
}

/** Seuils pour documentation UI */
export function meterProbabilityThresholds() {
  return {
    caution: LEAK_PROB_CAUTION,
    warning: LEAK_PROB_WARNING,
    critical: LEAK_PROB_CRITICAL,
  };
}
