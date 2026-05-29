import {
  METER_PLAN_POINTS,
  SENSOR_PLAN_POINTS,
  ZONE_PLAN_POINTS,
} from "../components/sitePlanCoordinates";

const UPSTREAM_T = 0.15;
const DOWNSTREAM_T = 0.85;

export function buildMeterLookup(meters) {
  const map = {};
  for (const m of meters || []) {
    if (m.plan_x != null && m.plan_y != null) {
      map[m.meter_id] = { x: Number(m.plan_x), y: Number(m.plan_y) };
    }
  }
  for (const [id, pt] of Object.entries(METER_PLAN_POINTS)) {
    if (!map[id]) map[id] = { ...pt };
  }
  return map;
}

export function resolveMeterXY(meterId, meterLookup) {
  return meterLookup?.[meterId] || METER_PLAN_POINTS[meterId] || null;
}

export function resolveSegmentEndpoints(segment, meterLookup) {
  if (!segment) return null;
  const up = resolveMeterXY(segment.upstream_meter, meterLookup);
  const down = resolveMeterXY(segment.downstream_meter, meterLookup);
  if (up && down) return { up, down };
  if (up) return { up, down: up };
  if (down) return { up: down, down };
  return null;
}

export function interpolatePlanXY(a, b, t) {
  const r = Math.max(0, Math.min(1, t));
  return {
    x: Math.round((a.x + (b.x - a.x) * r) * 10) / 10,
    y: Math.round((a.y + (b.y - a.y) * r) * 10) / 10,
  };
}

export function sensorInterpolationT(sensor) {
  const role = (sensor.role || "").toLowerCase();
  const sid = String(sensor.sensor_id || "");
  if (role === "downstream" || sid.endsWith("_B")) return DOWNSTREAM_T;
  return UPSTREAM_T;
}

export function segmentForZone(zoneId, segments) {
  const zid = Number(zoneId);
  return (segments || []).find((s) => Number(s.zone_id) === zid) || null;
}

/** Capteur : base / compteurs du troncon / reference statique. */
export function resolveSensorPlanXY(sensor, segments, meterLookup) {
  if (sensor.plan_x != null && sensor.plan_y != null) {
    return { x: Number(sensor.plan_x), y: Number(sensor.plan_y) };
  }
  const zid = sensor.zone_id;
  let seg = sensor.segment || null;
  if (!seg && sensor.segment_id) {
    seg = (segments || []).find((s) => s.segment_id === sensor.segment_id) || null;
  }
  if (!seg) seg = segmentForZone(zid, segments);
  const ends = resolveSegmentEndpoints(seg, meterLookup);
  if (ends) return interpolatePlanXY(ends.up, ends.down, sensorInterpolationT(sensor));
  const fromSensor = SENSOR_PLAN_POINTS[sensor.sensor_id];
  if (fromSensor) return { ...fromSensor };
  return { x: 500, y: 500 };
}

function centroidPlanXY(points) {
  if (!points.length) return { x: 500, y: 500 };
  if (points.length === 1) return { ...points[0] };
  const sx = points.reduce((a, p) => a + p.x, 0);
  const sy = points.reduce((a, p) => a + p.y, 0);
  return {
    x: Math.round((sx / points.length) * 10) / 10,
    y: Math.round((sy / points.length) * 10) / 10,
  };
}

/** Zone : centre des capteurs de la zone, sinon manuel / compteurs / reference. */
export function resolveZonePlanXY(zone, segments, meterLookup, sensors = []) {
  const zid = Number(zone.zone_id ?? zone.id);
  const zoneSensors = (sensors || []).filter((s) => Number(s.zone_id) === zid);
  if (zoneSensors.length) {
    const seg = zone.segment || segmentForZone(zid, segments);
    const pts = zoneSensors.map((s) => resolveSensorPlanXY(s, segments, meterLookup));
    return centroidPlanXY(pts);
  }
  if (zone.plan_x != null && zone.plan_y != null) {
    return { x: Number(zone.plan_x), y: Number(zone.plan_y) };
  }
  const seg = zone.segment || segmentForZone(zid, segments);
  const ends = resolveSegmentEndpoints(seg, meterLookup);
  if (ends) return interpolatePlanXY(ends.up, ends.down, 0.5);
  const fromLookup = ZONE_PLAN_POINTS[zid];
  if (fromLookup) return { ...fromLookup };
  return { x: 500, y: 500 };
}

export function zoneMapCoords(zone, segments, meterLookup, sensors = []) {
  const pt = resolveZonePlanXY(zone, segments, meterLookup, sensors);
  return { ...zone, x: pt.x, y: pt.y, plan_x: pt.x, plan_y: pt.y };
}

export function sensorMapCoords(sensor, segments, meterLookup) {
  const pt = resolveSensorPlanXY(sensor, segments, meterLookup);
  return { ...sensor, x: pt.x, y: pt.y, plan_x: pt.x, plan_y: pt.y };
}
