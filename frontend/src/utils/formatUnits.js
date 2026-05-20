/** Formats d'affichage unites HydroTrack (debit m3/h, volume m3). */

export function formatFlowM3h(value, digits = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${n.toFixed(digits)} m³/h`;
}

export function formatVolumeM3(value, digits = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${n.toFixed(digits)} m³`;
}
