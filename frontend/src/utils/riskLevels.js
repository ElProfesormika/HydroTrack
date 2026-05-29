import { PROBABILITY_BANDS, riskFromProbability } from "./riskThresholds";

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

/** Compteurs : couleur = probabilite de fuite ML (ou alerte si pas de ML) */
export const METER_LEGEND_ITEMS = [
  ...PROBABILITY_BANDS.map(({ risk, label, range }) => ({
    risk,
    label: `${label} (${range})`,
  })),
  { risk: "no_data", label: "Sans données" },
];

export const METER_MAP_PATH_BY_RISK = {
  ...MAP_PATH_BY_RISK,
  no_data: {
    color: "#546e7a",
    fillColor: "#cfd8dc",
    fillOpacity: 0.55,
    weight: 3,
    dashArray: "6 4",
  },
};

export { riskFromProbability as riskFromLeak, riskFromProbability as riskFromScore } from "./riskThresholds";

export function riskLabel(risk) {
  const labels = {
    normal: "Normal",
    caution: "Vigilance",
    warning: "Attention",
    critical: "Critique",
    offline: "Hors ligne",
    no_data: "Sans données",
  };
  return labels[risk] || "Normal";
}

export const ZONE_LEGEND_ITEMS = [
  { risk: "normal", label: "Troncon normal" },
  { risk: "caution", label: "Troncon vigilance" },
  { risk: "warning", label: "Troncon en analyse" },
  { risk: "critical", label: "Fuite confirmee" },
];

/** Troncon zone — vert / jaune / orange / rouge (signal principal sur la carte). */
export function zoneSegmentPathOptions(risk) {
  const stroke = RISK_COLORS[risk] || RISK_COLORS.normal;
  return {
    color: stroke,
    weight: risk === "critical" ? 9 : risk === "warning" ? 8 : risk === "caution" ? 7 : 6,
    opacity: risk === "normal" ? 0.62 : 0.92,
    lineCap: "round",
    lineJoin: "round",
  };
}

export function sensorBackbonePathOptions() {
  return {
    color: "#01579b",
    weight: 4,
    opacity: 0.65,
    lineCap: "round",
    lineJoin: "round",
  };
}

export function markerRadiusForRisk(risk) {
  if (risk === "critical") return 12;
  if (risk === "warning") return 10;
  if (risk === "offline") return 8;
  return 9;
}

/** Pastille milieu de troncon — anneau colore selon l'etat du troncon. */
export function zoneMarkerRadius() {
  return 7;
}

export function zoneMarkerPathOptions(risk) {
  const stroke = RISK_COLORS[risk] || RISK_COLORS.normal;
  const fill = RISK_FILL_BRIGHT[risk] || RISK_FILL_BRIGHT.normal;
  return {
    color: stroke,
    fillColor: fill,
    fillOpacity: risk === "normal" ? 0.35 : 0.65,
    weight: risk === "critical" ? 3 : 2.5,
  };
}

/** Capteurs sur carte : couleur fixe (position), pas le niveau de risque du troncon. */
export function sensorMapMarkerPathOptions(offline = false) {
  if (offline) {
    return { color: "#546e7a", fillColor: "#cfd8dc", fillOpacity: 0.92, weight: 2 };
  }
  return { color: "#0d47a1", fillColor: "#90caf9", fillOpacity: 1, weight: 2.5 };
}

export function sensorMapMarkerRadius() {
  return 7;
}

export function pointColorFromLeak(probability) {
  return RISK_COLORS[riskFromProbability(probability)] || RISK_COLORS.normal;
}

export function barColorFromAvgScore(score) {
  const risk = riskFromProbability(score);
  const alpha = {
    normal: "rgba(46, 125, 50, 0.55)",
    caution: "rgba(249, 168, 37, 0.7)",
    warning: "rgba(239, 108, 0, 0.72)",
    critical: "rgba(198, 40, 40, 0.75)",
  };
  return alpha[risk] || alpha.normal;
}
