import { CRS } from "leaflet";
import { Fragment, useMemo, useRef, useState } from "react";
import { CircleMarker, Circle, ImageOverlay, MapContainer, Polyline, Popup } from "react-leaflet";
import { PlanMapFitBounds } from "./PlanMapFit";
import { PLAN_BOUNDS, PLAN_HEIGHT, PLAN_WIDTH, metersToPlanRadius } from "./sitePlanCoordinates";
import { buildMeterLookup, sensorMapCoords } from "../utils/planCoordinates";
import { buildLeakMarkers } from "../utils/leakLocalization";
import { buildSensorBackbonePath, buildZoneSegments } from "../utils/sensorNetworkPath";
import {
  RISK_COLORS,
  ZONE_LEGEND_ITEMS,
  riskFromLeak,
  riskLabel,
  sensorBackbonePathOptions,
  sensorMapMarkerPathOptions,
  sensorMapMarkerRadius,
  zoneMarkerPathOptions,
  zoneMarkerRadius,
  zoneSegmentPathOptions,
} from "../utils/riskLevels";

const LEAK_POINT_STYLE = {
  color: "#ffffff",
  fillColor: "#c62828",
  fillOpacity: 1,
  weight: 3,
};

const LEAK_ZONE_SPAN_STYLE = {
  color: "#ff1744",
  weight: 10,
  opacity: 0.88,
  lineCap: "round",
};

const LEAK_RADIUS_CIRCLE_STYLE = {
  color: "#c62828",
  weight: 2,
  fillColor: "#ff5252",
  fillOpacity: 0.14,
  dashArray: "6 4",
};

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

function toSensorImageCoords(sensors, meterLookup) {
  return (sensors || []).map((sensor, index) => {
    const pt = sensorMapCoords(sensor, null, meterLookup);
    if (pt.x != null && pt.y != null) return pt;
    return { ...sensor, x: 240 + (index % 8) * 60, y: 420 + Math.floor(index / 8) * 60 };
  });
}

function LeakPointPopup({ leak }) {
  return (
    <>
      <strong>{leak.zone_name || `Zone ${leak.zone_id}`}</strong>
      <br />
      Point de fuite estime (x)
      <br />
      {leak.message}
      <br />
      {leak.distance_m_from_upstream != null ? (
        <>
          x = {Number(leak.distance_m_from_upstream).toFixed(0)} m depuis {leak.upstream_meter}
          {leak.segment_length_m != null ? ` / ${Number(leak.segment_length_m).toFixed(0)} m` : ""}
          <br />
        </>
      ) : null}
      {leak.leak_radius_m != null ? (
        <>
          Zone estimee : R ≈ {Number(leak.leak_radius_m).toFixed(0)} m (tres reduite)
          <br />
        </>
      ) : null}
      {leak.localization_confidence != null ? (
        <>Confiance : {Math.round(Number(leak.localization_confidence) * 100)} %</>
      ) : null}
    </>
  );
}

function resolveZoneRisk(zone) {
  return (
    zone?.risk_level ||
    (zone?.status === "leak_confirmed" ? "critical" : zone?.status === "investigating" ? "warning" : "normal")
  );
}

function resolveZoneRiskForSensor(sensor, zones) {
  const zone = (zones || []).find((z) => Number(z.id ?? z.zone_id) === Number(sensor.zone_id));
  if (zone) return resolveZoneRisk(zone);
  if (sensor.confirmation_status === "confirmed") return "critical";
  if (sensor.confirmation_status === "pending") return "warning";
  if (sensor.leak_score != null) return riskFromLeak(Number(sensor.leak_score));
  return "normal";
}

function isSensorOffline(sensor) {
  return sensor.risk_level === "offline" || (!sensor.last_seen && sensor.leak_score == null);
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

function SensorHoverTooltip({ sensor, zoneRisk }) {
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
      <p className={`map-tooltip-risk map-tooltip-risk--${zoneRisk}`}>
        Troncon : {riskLabel(zoneRisk)}
      </p>
      <dl className="map-tooltip-meta">
        <div>
          <dt>Confirmation troncon</dt>
          <dd>{confirmationLabel}</dd>
        </div>
        {sensor.leak_score != null ? (
          <div>
            <dt>Score pression (capteur)</dt>
            <dd>
              {Number(sensor.leak_score).toFixed(2)} ({Math.round(Number(sensor.leak_score) * 100)} %)
            </dd>
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
  leakLocalizations = [],
  meters = [],
  title = "Cartographie du reseau",
  caption,
}) {
  const mapWrapRef = useRef(null);
  const [hoverTip, setHoverTip] = useState(null);
  const meterLookup = useMemo(() => buildMeterLookup(meters), [meters]);
  const sensorsImageCoords = useMemo(() => toSensorImageCoords(sensors, meterLookup), [sensors, meterLookup]);
  const backbonePath = useMemo(() => buildSensorBackbonePath(sensorsImageCoords), [sensorsImageCoords]);
  const zoneSegments = useMemo(
    () => buildZoneSegments(sensorsImageCoords, zones),
    [sensorsImageCoords, zones]
  );
  const leakMarkers = useMemo(
    () => buildLeakMarkers({ alerts, zones, leakLocalizations, zoneSegments }),
    [alerts, zones, leakLocalizations, zoneSegments]
  );

  const tooltipPlacement = useMemo(() => {
    if (!hoverTip || !mapWrapRef.current) return null;
    const { clientWidth, clientHeight } = mapWrapRef.current;
    return computeTooltipPlacement(hoverTip.x, hoverTip.y, clientWidth, clientHeight);
  }, [hoverTip]);

  const showHoverTip = (event, sensor, zoneRisk) => {
    const map = event.target?._map;
    if (!map) return;
    const point = map.latLngToContainerPoint(event.latlng);
    setHoverTip({ sensor, zoneRisk, x: point.x, y: point.y });
  };

  const hideHoverTip = () => setHoverTip(null);

  return (
    <section className="card map-panel map-panel--sensors">
      <h3>{title}</h3>
      {caption ? <p className="map-caption">{caption}</p> : null}
      <ul className="map-risk-legend map-risk-legend--sensors" aria-label="Legende carte capteurs">
        <li className="map-legend-network">
          <span className="map-risk-legend-line map-risk-legend-line--backbone" />
          Reseau capteurs (~10 km)
        </li>
        <li className="map-legend-network">
          <span className="map-risk-legend-dot map-risk-legend-dot--sensor-fixed" />
          Capteur (emplacement)
        </li>
        {ZONE_LEGEND_ITEMS.map(({ risk, label }) => (
          <li key={risk}>
            <span
              className="map-risk-legend-line map-risk-legend-line--zone-risk"
              style={{ borderTopColor: RISK_COLORS[risk] }}
            />
            {label}
          </li>
        ))}
        <li className="map-legend-network">
          <span className="map-risk-legend-line map-risk-legend-line--leak-span" />
          Zone fuite R sur troncon
        </li>
        <li className="map-legend-network">
          <span className="map-risk-legend-dot map-risk-legend-dot--leak-point" />
          Point de fuite (x)
        </li>
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

            {backbonePath.length >= 2 ? (
              <Polyline
                positions={backbonePath}
                pathOptions={sensorBackbonePathOptions()}
                className="map-sensor-backbone"
              />
            ) : null}

            {zoneSegments.map((seg) => {
              const risk = resolveZoneRisk(seg.zone || { risk_level: "normal", status: "normal" });
              return (
                <Polyline
                  key={`zone-seg-${seg.zoneId}`}
                  positions={seg.positions}
                  pathOptions={zoneSegmentPathOptions(risk)}
                  className="map-zone-segment"
                >
                  <Popup>
                    <strong>{seg.zone?.name || `Zone ${seg.zoneId}`}</strong>
                    <br />
                    Troncon capteurs : {seg.sensors.map((s) => s.sensor_id).join(" → ")}
                    <br />
                    Etat : {riskLabel(risk)}
                  </Popup>
                </Polyline>
              );
            })}

            {zoneSegments.map((seg) => {
              const risk = resolveZoneRisk(seg.zone || {});
              const [my, mx] = seg.midpoint;
              return (
                <CircleMarker
                  key={`zone-label-${seg.zoneId}`}
                  center={[my, mx]}
                  radius={zoneMarkerRadius()}
                  pathOptions={zoneMarkerPathOptions(risk)}
                  className="map-zone-marker"
                >
                  <Popup>
                    <strong>Zone {seg.zoneId}</strong>
                    <br />
                    {seg.zone?.name}
                    <br />
                    {riskLabel(risk)}
                  </Popup>
                </CircleMarker>
              );
            })}

            {sensorsImageCoords.map((sensor) => {
              const offline = isSensorOffline(sensor);
              const zoneRisk = resolveZoneRiskForSensor(sensor, zones);
              const opts = sensorMapMarkerPathOptions(offline);
              return (
                <CircleMarker
                  key={sensor.sensor_id}
                  center={[sensor.y, sensor.x]}
                  radius={sensorMapMarkerRadius()}
                  pathOptions={opts}
                  className={`map-sensor-marker${offline ? " map-sensor-marker--offline" : ""}`}
                  eventHandlers={{
                    mouseover: (e) => showHoverTip(e, sensor, zoneRisk),
                    mouseout: hideHoverTip,
                  }}
                >
                  <Popup>
                    <SensorHoverTooltip sensor={sensor} zoneRisk={zoneRisk} />
                  </Popup>
                </CircleMarker>
              );
            })}

            {leakMarkers.map((leak, idx) => (
              <Fragment key={`leak-${leak.zone_id}-${idx}`}>
                {leak.zoneLine ? (
                  <Polyline
                    positions={leak.zoneLine}
                    pathOptions={LEAK_ZONE_SPAN_STYLE}
                    className="map-leak-zone-span"
                  />
                ) : null}
                {leak.leak_radius_m != null ? (
                  <Circle
                    center={[leak.y, leak.x]}
                    radius={metersToPlanRadius(leak.leak_radius_m)}
                    pathOptions={LEAK_RADIUS_CIRCLE_STYLE}
                    className="map-leak-radius"
                  />
                ) : null}
                <CircleMarker
                  center={[leak.y, leak.x]}
                  radius={8}
                  pathOptions={LEAK_POINT_STYLE}
                  className="map-leak-point"
                >
                  <Popup>
                    <LeakPointPopup leak={leak} />
                  </Popup>
                </CircleMarker>
              </Fragment>
            ))}
          </MapContainer>
        </div>
        {hoverTip && tooltipPlacement ? (
          <div
            className={`map-floating-tooltip map-floating-tooltip--${tooltipPlacement.placement}`}
            style={{ left: tooltipPlacement.left, top: tooltipPlacement.top }}
            role="tooltip"
          >
            <SensorHoverTooltip sensor={hoverTip.sensor} zoneRisk={hoverTip.zoneRisk} />
          </div>
        ) : null}
      </div>
    </section>
  );
}
