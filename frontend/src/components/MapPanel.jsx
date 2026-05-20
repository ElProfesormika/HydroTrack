import { CRS } from "leaflet";
import { useMemo, useRef, useState } from "react";
import { CircleMarker, ImageOverlay, MapContainer, Popup } from "react-leaflet";
import { PlanMapFitBounds } from "./PlanMapFit";
import {
  PLAN_BOUNDS,
  PLAN_HEIGHT,
  PLAN_WIDTH,
  SENSOR_PLAN_POINTS,
  ZONE_PLAN_POINTS,
} from "./sitePlanCoordinates";
import {
  MAP_LEGEND_ITEMS,
  MAP_PATH_BY_RISK,
  markerRadiusForRisk,
  riskLabel,
  zoneMarkerPathOptions,
  zoneMarkerRadius,
} from "../utils/riskLevels";

const PLAN_CAPTEURS_URL = "/plans/edf-plan.jpeg";

const TOOLTIP_EST_WIDTH = 268;
const TOOLTIP_EST_HEIGHT = 200;
const TOOLTIP_EDGE_PAD = 12;

function computeTooltipPlacement(x, y, containerWidth, containerHeight) {
  const halfW = TOOLTIP_EST_WIDTH / 2;
  const left = Math.max(
    halfW + TOOLTIP_EDGE_PAD,
    Math.min(containerWidth - halfW - TOOLTIP_EDGE_PAD, x)
  );
  const spaceAbove = y;
  const spaceBelow = containerHeight - y;
  if (spaceAbove >= TOOLTIP_EST_HEIGHT + TOOLTIP_EDGE_PAD || spaceAbove >= spaceBelow) {
    return { left, top: y - 8, placement: "above" };
  }
  return { left, top: y + 14, placement: "below" };
}

function toSensorImageCoords(sensors) {
  return (sensors || []).map((sensor, index) => {
    if (sensor.plan_x != null && sensor.plan_y != null) {
      return { ...sensor, x: sensor.plan_x, y: sensor.plan_y };
    }
    const fromSensor = SENSOR_PLAN_POINTS[sensor.sensor_id];
    if (fromSensor) return { ...sensor, x: fromSensor.x, y: fromSensor.y };
    const zonePt = ZONE_PLAN_POINTS[sensor.zone_id];
    const base = zonePt || { x: 240 + (index % 8) * 60, y: 420 + Math.floor(index / 8) * 60 };
    const offsetX = String(sensor.sensor_id || "").endsWith("_A") ? -16 : 16;
    return { ...sensor, x: base.x + offsetX, y: base.y + (offsetX < 0 ? 8 : -8) };
  });
}

function toZoneImageCoords(zones) {
  return (zones || []).map((zone, index) => {
    if (zone.plan_x != null && zone.plan_y != null) {
      return { ...zone, x: zone.plan_x, y: zone.plan_y };
    }
    const fromLookup = ZONE_PLAN_POINTS[zone.id];
    if (fromLookup) return { ...zone, ...fromLookup };
    return { ...zone, x: 240 + (index % 8) * 60, y: 420 + Math.floor(index / 8) * 60 };
  });
}

function toAlertImageCoords(alerts) {
  return (alerts || []).map((alert, index) => {
    if (alert.plan_x != null && alert.plan_y != null) {
      return { ...alert, x: alert.plan_x, y: alert.plan_y };
    }
    const base = ZONE_PLAN_POINTS[alert.zone_id] || { x: 470, y: 500 };
    const spreadX = (index % 3) * 14 - 14;
    const spreadY = Math.floor(index / 3) * 10;
    return {
      ...alert,
      x: Math.max(30, Math.min(PLAN_WIDTH - 30, base.x + spreadX)),
      y: Math.max(30, Math.min(PLAN_HEIGHT - 30, base.y + spreadY)),
    };
  });
}

function resolveSensorRisk(sensor) {
  return sensor.risk_level || "normal";
}

function resolveZoneRisk(zone) {
  return (
    zone.risk_level ||
    (zone.status === "leak_confirmed" ? "critical" : zone.status === "investigating" ? "warning" : "normal")
  );
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function SensorHoverTooltip({ sensor, risk }) {
  const confirmation = sensor.confirmation_status;
  const confirmationLabel =
    confirmation === "confirmed"
      ? "Fuite confirmee"
      : confirmation === "pending"
        ? "Analyse en cours"
        : "RAS";

  return (
    <div className="map-tooltip-inner">
      <strong>{sensor.sensor_id}</strong>
      <span className="map-tooltip-id">{sensor.zone_name || `Zone ${sensor.zone_id}`}</span>
      <p className={`map-tooltip-risk map-tooltip-risk--${risk}`}>{riskLabel(risk)}</p>
      <dl className="map-tooltip-meta">
        <div>
          <dt>Confirmation zone</dt>
          <dd>{confirmationLabel}</dd>
        </div>
        {sensor.leak_score != null ? (
          <div>
            <dt>Score pression</dt>
            <dd>{Number(sensor.leak_score).toFixed(2)}</dd>
          </div>
        ) : null}
        {sensor.intensity != null ? (
          <div>
            <dt>Intensite</dt>
            <dd>{Number(sensor.intensity).toFixed(0)}</dd>
          </div>
        ) : null}
        {sensor.last_seen ? (
          <div>
            <dt>Derniere mesure</dt>
            <dd>{formatDateTime(sensor.last_seen)}</dd>
          </div>
        ) : null}
        {sensor.segment ? (
          <div>
            <dt>Troncon</dt>
            <dd>
              {sensor.segment.upstream_meter} → {sensor.segment.downstream_meter}
            </dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}

export function MapPanel({
  zones,
  sensors,
  alerts,
  title = "Cartographie du reseau",
  caption,
}) {
  const mapWrapRef = useRef(null);
  const [hoverTip, setHoverTip] = useState(null);
  const sensorsImageCoords = toSensorImageCoords(sensors);
  const zonesImageCoords = toZoneImageCoords(zones);
  const alertsImageCoords = toAlertImageCoords(alerts);

  const tooltipPlacement = useMemo(() => {
    if (!hoverTip || !mapWrapRef.current) return null;
    const { clientWidth, clientHeight } = mapWrapRef.current;
    return computeTooltipPlacement(hoverTip.x, hoverTip.y, clientWidth, clientHeight);
  }, [hoverTip]);

  const showHoverTip = (event, sensor, risk) => {
    const map = event.target?._map;
    if (!map) return;
    const point = map.latLngToContainerPoint(event.latlng);
    setHoverTip({ sensor, risk, x: point.x, y: point.y });
  };

  const hideHoverTip = () => setHoverTip(null);

  return (
    <section className="card map-panel map-panel--sensors">
      <h3>{title}</h3>
      {caption ? <p className="map-caption">{caption}</p> : null}
      <ul className="map-risk-legend" aria-label="Legende des couleurs capteurs">
        {MAP_LEGEND_ITEMS.map(({ risk, label }) => (
          <li key={risk}>
            <span className="map-risk-legend-dot" style={{ background: MAP_PATH_BY_RISK[risk].fillColor }} />
            {label}
          </li>
        ))}
      </ul>
      <div ref={mapWrapRef} className="map-panel-fill-wrapper">
        <div className="map-panel-fill map-panel-fill--network">
          <MapContainer
            center={[PLAN_HEIGHT / 2, PLAN_WIDTH / 2]}
            zoom={-1}
            crs={CRS.Simple}
            minZoom={-4}
            maxZoom={3}
            maxBounds={PLAN_BOUNDS}
            className="map-leaflet map-leaflet--sensors"
          >
            <PlanMapFitBounds bounds={PLAN_BOUNDS} mode="cover" />
            <ImageOverlay url={PLAN_CAPTEURS_URL} bounds={PLAN_BOUNDS} />

            {zonesImageCoords.map((zone) => {
              const risk = resolveZoneRisk(zone);
              const opts = zoneMarkerPathOptions(risk);
              return (
                <CircleMarker
                  key={`zone-${zone.id}`}
                  center={[zone.y, zone.x]}
                  radius={zoneMarkerRadius()}
                  pathOptions={opts}
                >
                  <Popup>
                    <strong>{zone.name}</strong>
                    <br />
                    Etat : {riskLabel(risk)}
                    {zone.segment ? (
                      <>
                        <br />
                        Troncon : {zone.segment.upstream_meter} → {zone.segment.downstream_meter}
                      </>
                    ) : null}
                  </Popup>
                </CircleMarker>
              );
            })}

            {sensorsImageCoords.map((sensor) => {
              const risk = resolveSensorRisk(sensor);
              const opts = MAP_PATH_BY_RISK[risk] || MAP_PATH_BY_RISK.normal;
              return (
                <CircleMarker
                  key={sensor.sensor_id}
                  center={[sensor.y, sensor.x]}
                  radius={markerRadiusForRisk(risk)}
                  pathOptions={opts}
                  eventHandlers={{
                    mouseover: (e) => showHoverTip(e, sensor, risk),
                    mouseout: hideHoverTip,
                  }}
                >
                  <Popup>
                    <SensorHoverTooltip sensor={sensor} risk={risk} />
                  </Popup>
                </CircleMarker>
              );
            })}

            {alertsImageCoords.map((alert, idx) => (
              <CircleMarker
                key={`${alert.zone_id}-${idx}`}
                center={[alert.y, alert.x]}
                radius={11}
                pathOptions={MAP_PATH_BY_RISK.critical}
              >
                <Popup>
                  <strong>{alert.zone_name}</strong>
                  <br />
                  {alert.message}
                  <br />
                  {alert.distance_m_from_upstream != null ? (
                    <>
                      Distance : {Number(alert.distance_m_from_upstream).toFixed(0)} m depuis {alert.upstream_meter}
                      <br />
                    </>
                  ) : null}
                  Gravite : {alert.severity}
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>
        {hoverTip && tooltipPlacement ? (
          <div
            className={`map-floating-tooltip map-floating-tooltip--${tooltipPlacement.placement}`}
            style={{ left: tooltipPlacement.left, top: tooltipPlacement.top }}
            role="tooltip"
          >
            <SensorHoverTooltip sensor={hoverTip.sensor} risk={hoverTip.risk} />
          </div>
        ) : null}
      </div>
    </section>
  );
}
