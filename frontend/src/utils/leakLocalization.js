/** Utilitaires point de fuite x et zone estimee R sur le plan reseau. */

export function interpolateOnSegment(positions, ratio) {
  if (!positions?.length) return null;
  const t = Math.max(0, Math.min(1, Number(ratio)));
  if (positions.length === 1) {
    const [y, x] = positions[0];
    return { x, y };
  }
  const [y0, x0] = positions[0];
  const [y1, x1] = positions[positions.length - 1];
  return {
    x: x0 + (x1 - x0) * t,
    y: y0 + (y1 - y0) * t,
  };
}

export function leakZoneRatios(distanceM, lengthM, radiusM) {
  const L = Math.max(Number(lengthM) || 1, 1);
  const x = Math.max(0, Number(distanceM) || 0);
  const R = Math.max(0, Number(radiusM) || 0);
  return {
    start: Math.max(0, x - R) / L,
    end: Math.min(L, x + R) / L,
  };
}

export function leakZoneOnSegment(positions, distanceM, lengthM, radiusM) {
  if (!positions?.length) return null;
  const { start, end } = leakZoneRatios(distanceM, lengthM, radiusM);
  const p0 = interpolateOnSegment(positions, start);
  const p1 = interpolateOnSegment(positions, end);
  if (!p0 || !p1) return null;
  return [
    [p0.y, p0.x],
    [p1.y, p1.x],
  ];
}

export function resolveLeakPlanCoords(marker, zoneSegment) {
  if (marker?.plan_x != null && marker?.plan_y != null) {
    return { x: Number(marker.plan_x), y: Number(marker.plan_y) };
  }
  const positions = zoneSegment?.positions;
  if (marker?.position_ratio != null && positions?.length >= 2) {
    return interpolateOnSegment(positions, marker.position_ratio);
  }
  if (marker?.distance_m_from_upstream != null && marker?.segment_length_m && positions?.length >= 2) {
    const ratio = Number(marker.distance_m_from_upstream) / Math.max(Number(marker.segment_length_m), 1);
    return interpolateOnSegment(positions, ratio);
  }
  return null;
}

/** Fusionne alertes carte, zones et historique localisations (fuites confirmees). */
export function buildLeakMarkers({ alerts = [], zones = [], leakLocalizations = [], zoneSegments = [] } = {}) {
  const byZone = new Map();
  const segByZone = new Map((zoneSegments || []).map((s) => [Number(s.zoneId), s]));

  const ingest = (raw) => {
    if (!raw) return;
    const confirmed =
      raw.confirmed === true ||
      raw.confirmed === 1 ||
      raw.distance_m_from_upstream != null ||
      raw.plan_x != null;
    if (!confirmed) return;
    const zid = Number(raw.zone_id ?? raw.id);
    if (!zid) return;
    const prev = byZone.get(zid);
    const ts = raw.timestamp || "";
    if (prev && (prev.timestamp || "") > ts) return;
    byZone.set(zid, { ...raw, zone_id: zid });
  };

  for (const loc of leakLocalizations || []) {
    if (loc.confirmed) ingest(loc);
  }
  for (const zone of zones || []) {
    const zid = Number(zone.id ?? zone.zone_id);
    const loc = zone.latest_localization;
    if (loc?.confirmed) {
      ingest({
        ...loc,
        zone_id: zid,
        zone_name: zone.name ?? zone.zone_name,
        segment_length_m: loc.segment_length_m ?? zone.segment?.length_m,
      });
    }
  }
  for (const alert of alerts || []) {
    ingest(alert);
  }

  return Array.from(byZone.values())
    .map((marker) => {
      const seg = segByZone.get(Number(marker.zone_id));
      const plan = resolveLeakPlanCoords(marker, seg);
      if (!plan) return null;

      const lengthM = marker.segment_length_m ?? seg?.zone?.segment?.length_m ?? 300;
      const radiusM = marker.leak_radius_m ?? 5;
      const dist = marker.distance_m_from_upstream;
      let zoneLine = null;
      if (seg?.positions?.length >= 2) {
        if (marker.leak_zone_ratio_start != null && marker.leak_zone_ratio_end != null) {
          const p0 = interpolateOnSegment(seg.positions, marker.leak_zone_ratio_start);
          const p1 = interpolateOnSegment(seg.positions, marker.leak_zone_ratio_end);
          zoneLine = p0 && p1 ? [[p0.y, p0.x], [p1.y, p1.x]] : null;
        }
        if (!zoneLine && dist != null) {
          zoneLine = leakZoneOnSegment(seg.positions, dist, lengthM, radiusM);
        }
      }

      return {
        ...marker,
        x: plan.x,
        y: plan.y,
        plan_x: plan.x,
        plan_y: plan.y,
        segment_length_m: lengthM,
        leak_radius_m: radiusM,
        zoneLine,
        segmentPositions: seg?.positions,
      };
    })
    .filter(Boolean)
    .sort((a, b) => String(b.timestamp || "").localeCompare(String(a.timestamp || "")));
}
