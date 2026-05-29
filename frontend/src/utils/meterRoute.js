/** Page de suivi détaillé d'un compteur (dashboard opérationnel). */
export const METER_DETAIL_PATH = "/dashboard/compteurs";

export function meterDetailUrl(meterId) {
  if (!meterId) return METER_DETAIL_PATH;
  const params = new URLSearchParams({ meter: String(meterId) });
  return `${METER_DETAIL_PATH}?${params.toString()}`;
}

export function meterDetailNavigationState(backTo = "/cartographie") {
  return { backTo };
}

export function readMeterFromSearch(search) {
  if (!search) return null;
  const value = new URLSearchParams(search).get("meter");
  return value ? String(value).trim() : null;
}
