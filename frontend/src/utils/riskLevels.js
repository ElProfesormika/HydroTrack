/** Couleurs : normal (vert), vigilance (jaune), attention (orange), critique (rouge) */
export const RISK_COLORS = {
  normal: "#2e7d32",
  caution: "#f9a825",
  warning: "#ef6c00",
  critical: "#c62828",
  offline: "#78909c",
};

/** Remplissages vifs pour lisibilite sur plan assombri */
export const RISK_FILL_BRIGHT = {
  normal: "#69f0ae",
  caution: "#ffee58",
  warning: "#ffb74d",
  critical: "#ff5252",
  offline: "#e0e0e0",
};

/** Styles Leaflet CircleMarker — points eclaires (contour + remplissage lumineux) */
export const MAP_PATH_BY_RISK = {
  normal: { color: "#1b5e20", fillColor: "#69f0ae", fillOpacity: 1, weight: 3 },
  caution: { color: "#e65100", fillColor: "#ffee58", fillOpacity: 1, weight: 3 },
  warning: { color: "#bf360c", fillColor: "#ffb74d", fillOpacity: 1, weight: 3 },
  critical: { color: "#b71c1c", fillColor: "#ff5252", fillOpacity: 1, weight: 3.5 },
  offline: { color: "#455a64", fillColor: "#eceff1", fillOpacity: 1, weight: 2.5 },
};

export const MAP_LEGEND_ITEMS = [
  { risk: "normal", label: "Normal" },
  { risk: "caution", label: "Vigilance" },
  { risk: "warning", label: "Attention" },
  { risk: "critical", label: "Critique" },
  { risk: "offline", label: "Hors ligne" },
];

export function riskFromLeak(probability) {
  const p = Number(probability) || 0;
  if (p >= 0.75) return "critical";
  if (p >= 0.5) return "warning";
  if (p >= 0.25) return "caution";
  return "normal";
}

export function riskFromScore(score) {
  return riskFromLeak(score);
}

export function riskLabel(risk) {
  const labels = {
    normal: "Normal",
    caution: "Vigilance",
    warning: "Attention",
    critical: "Critique",
    offline: "Hors ligne",
  };
  return labels[risk] || "Normal";
}

export function markerRadiusForRisk(risk) {
  if (risk === "critical") return 12;
  if (risk === "warning") return 10;
  if (risk === "offline") return 8;
  return 9;
}

/** Halo zones sur carte capteurs */
export function zoneMarkerRadius() {
  return 17;
}

export function zoneMarkerPathOptions(risk) {
  const base = MAP_PATH_BY_RISK[risk] || MAP_PATH_BY_RISK.normal;
  return {
    ...base,
    fillColor: RISK_FILL_BRIGHT[risk] || RISK_FILL_BRIGHT.normal,
    fillOpacity: 0.5,
    weight: 3,
  };
}

export function pointColorFromLeak(probability) {
  return RISK_COLORS[riskFromLeak(probability)] || RISK_COLORS.normal;
}

export function barColorFromAvgScore(score) {
  const s = Number(score) || 0;
  if (s >= 0.85) return "rgba(198, 40, 40, 0.75)";
  if (s >= 0.65) return "rgba(239, 108, 0, 0.72)";
  if (s >= 0.45) return "rgba(249, 168, 37, 0.7)";
  return "rgba(46, 125, 50, 0.55)";
}
