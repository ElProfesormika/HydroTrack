/** Seuils alignes backend risk_thresholds.py — probabilite / score 0-1 */

export const LEAK_PROB_CAUTION = 0.25;
export const LEAK_PROB_WARNING = 0.5;
export const LEAK_PROB_CRITICAL = 0.75;

export const RISK_ORDER = { no_data: 0, normal: 1, caution: 2, warning: 3, critical: 4 };

export const PROBABILITY_BANDS = [
  { risk: "normal", label: "Normal", range: `< ${Math.round(LEAK_PROB_CAUTION * 100)} %` },
  { risk: "caution", label: "Vigilance", range: `${Math.round(LEAK_PROB_CAUTION * 100)}–${Math.round(LEAK_PROB_WARNING * 100) - 1} %` },
  { risk: "warning", label: "Attention", range: `${Math.round(LEAK_PROB_WARNING * 100)}–${Math.round(LEAK_PROB_CRITICAL * 100) - 1} %` },
  { risk: "critical", label: "Critique", range: `≥ ${Math.round(LEAK_PROB_CRITICAL * 100)} %` },
];

export function riskFromProbability(probability) {
  const p = Number(probability) || 0;
  if (p >= LEAK_PROB_CRITICAL) return "critical";
  if (p >= LEAK_PROB_WARNING) return "warning";
  if (p >= LEAK_PROB_CAUTION) return "caution";
  return "normal";
}

export function riskFromAlertSeverity(severity) {
  const s = String(severity || "").toLowerCase();
  if (s === "critical") return "critical";
  if (s === "warning") return "warning";
  if (s === "caution") return "caution";
  return "normal";
}

export function maxRiskLevel(...levels) {
  let best = "normal";
  for (const level of levels) {
    if (!level || level === "offline") continue;
    if ((RISK_ORDER[level] ?? 0) > (RISK_ORDER[best] ?? 0)) best = level;
  }
  return best;
}

/** Libelle avec probabilite pour tooltips carte. */
export function riskLabelWithProbability(risk, probability) {
  const labels = {
    normal: "Normal",
    caution: "Vigilance",
    warning: "Attention",
    critical: "Critique",
    offline: "Hors ligne",
    no_data: "Sans données",
  };
  const base = labels[risk] || "Normal";
  if (probability == null || Number.isNaN(Number(probability))) return base;
  const pct = Math.round(Number(probability) * 100);
  return `${base} (${pct} %)`;
}
