/** Tracé réseau capteurs : ordre le long du réseau (~10 km) et segments par zone. */

function zoneIdFromSensor(sensor) {
  if (sensor.zone_id != null) return Number(sensor.zone_id);
  const m = String(sensor.sensor_id || "").match(/S_Z(\d+)/i);
  return m ? Number(m[1]) : 0;
}

function isDownstreamSensor(sensor) {
  const role = (sensor.role || "").toLowerCase();
  const sid = String(sensor.sensor_id || "");
  return role === "downstream" || sid.endsWith("_B");
}

/** Capteurs triés le long du réseau (zone 1→33, amont avant aval). */
export function orderSensorsAlongNetwork(sensors) {
  return [...(sensors || [])].sort((a, b) => {
    const za = zoneIdFromSensor(a);
    const zb = zoneIdFromSensor(b);
    if (za !== zb) return za - zb;
    return (isDownstreamSensor(a) ? 1 : 0) - (isDownstreamSensor(b) ? 1 : 0);
  });
}

/** Positions Leaflet [y, x] pour une ligne continue. */
export function buildSensorBackbonePath(sensors) {
  const ordered = orderSensorsAlongNetwork(sensors);
  return ordered
    .filter((s) => s.x != null && s.y != null)
    .map((s) => [s.y, s.x]);
}

/** Segments par zone : tronçon entre capteur amont et aval. */
export function buildZoneSegments(sensors, zones) {
  const zoneById = new Map((zones || []).map((z) => [Number(z.id ?? z.zone_id), z]));
  const byZone = new Map();

  for (const s of sensors || []) {
    if (s.x == null || s.y == null) continue;
    const zid = zoneIdFromSensor(s);
    if (!byZone.has(zid)) byZone.set(zid, []);
    byZone.get(zid).push(s);
  }

  const segments = [];
  for (const [zid, list] of byZone.entries()) {
    const sorted = [...list].sort((a, b) => (isDownstreamSensor(a) ? 1 : 0) - (isDownstreamSensor(b) ? 1 : 0));
    if (sorted.length < 2) continue;
    const zone = zoneById.get(zid);
    segments.push({
      zoneId: zid,
      zone,
      sensors: sorted,
      positions: sorted.map((s) => [s.y, s.x]),
      midpoint: [
        (sorted[0].y + sorted[sorted.length - 1].y) / 2,
        (sorted[0].x + sorted[sorted.length - 1].x) / 2,
      ],
    });
  }
  return segments.sort((a, b) => a.zoneId - b.zoneId);
}
