import { CRS } from "leaflet";
import { useMemo, useRef, useState } from "react";
import { CircleMarker, ImageOverlay, MapContainer, Popup } from "react-leaflet";
import { Link, useNavigate } from "react-router-dom";
import { meterDetailNavigationState, meterDetailUrl } from "../utils/meterRoute";
import { PlanMapFitBounds } from "./PlanMapFit";
import { METER_PLAN_POINTS, PLAN_BOUNDS, PLAN_HEIGHT, PLAN_WIDTH } from "./sitePlanCoordinates";
import { resolveMeterMapRisk } from "../utils/meterMapRisk";
import {
  METER_LEGEND_ITEMS,
  METER_MAP_PATH_BY_RISK,
  markerRadiusForRisk,
  riskLabel,
} from "../utils/riskLevels";

const PLAN_COMPTEURS_URL = "/plans/edf-plan.jpeg";

const TOOLTIP_EST_WIDTH = 268;
const TOOLTIP_EST_HEIGHT = 210;
const TOOLTIP_EDGE_PAD = 12;

const RISK_SOURCE_LABELS = {
  ml: "Derniere anomalie ML (table anomalies)",
  alert: "Alerte active (probabilite dans le message)",
  alert_level: "Alerte active (niveau severite)",
  reading: "Releve sans anomalie",
  none: "Aucune donnee",
};

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

function toMeterImageCoords(meters) {
  return (meters || []).map((meter, index) => {
    if (meter.plan_x != null && meter.plan_y != null) {
      return { ...meter, x: Number(meter.plan_x), y: Number(meter.plan_y) };
    }
    const fromLookup = METER_PLAN_POINTS[meter.meter_id];
    if (fromLookup) return { ...meter, ...fromLookup };
    return { ...meter, x: 320 + (index % 10) * 36, y: 620 + Math.floor(index / 10) * 28 };
  });
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

function formatPercent(probability) {
  if (probability == null || Number.isNaN(Number(probability))) return "—";
  return `${Math.round(Number(probability) * 100)} %`;
}

function MeterHoverTooltip({
  meter,
  risk,
  riskLabelText,
  anom,
  alert,
  displayProbability,
  anomalyScore,
  hasData,
  riskSource,
}) {
  const stateDate = alert?.timestamp
    ? formatDateTime(alert.timestamp)
    : anom?.timestamp
      ? formatDateTime(anom.timestamp)
      : formatDateTime(meter.last_reading_at);

  return (
    <div className="map-tooltip-inner">
      <strong>{meter.name}</strong>
      <span className="map-tooltip-id">{meter.meter_id}</span>
      <p className={`map-tooltip-risk map-tooltip-risk--${risk}`}>{riskLabelText}</p>
      <dl className="map-tooltip-meta">
        {!hasData ? (
          <div>
            <dt>Donnees</dt>
            <dd>Aucun releve, anomalie ni alerte active</dd>
          </div>
        ) : (
          <>
            <div>
              <dt>Prob. fuite affichee</dt>
              <dd>{formatPercent(displayProbability)}</dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd>{RISK_SOURCE_LABELS[riskSource] || riskSource}</dd>
            </div>
            {anomalyScore != null ? (
              <div>
                <dt>Score technique ML</dt>
                <dd>
                  {Number(anomalyScore).toFixed(1)} / 100 <span className="map-tooltip-hint-inline">(indice, pas la prob.)</span>
                </dd>
              </div>
            ) : null}
            {alert ? (
              <>
                <div>
                  <dt>Alerte</dt>
                  <dd>{alert.message}</dd>
                </div>
              </>
            ) : null}
            <div>
              <dt>Mise a jour</dt>
              <dd>{stateDate}</dd>
            </div>
          </>
        )}
        {meter.last_reading_at ? (
          <>
            <div>
              <dt>Derniere mesure</dt>
              <dd>{formatDateTime(meter.last_reading_at)}</dd>
            </div>
            <div>
              <dt>Debit</dt>
              <dd>{Number(meter.last_flow_rate || 0).toFixed(2)} m³/h</dd>
            </div>
          </>
        ) : null}
      </dl>
      <p className="map-tooltip-hint">Clic : suivi detaille</p>
    </div>
  );
}

export function MeterMapPanel({
  meters,
  anomalies,
  alerts = [],
  title = "Carte des compteurs reseau",
  caption = "Prob. fuite ML (0-1) : < 25 % vert · 25-49 % jaune · 50-74 % orange · ≥ 75 % rouge. Valeur renvoyee par /api/map/meters.",
}) {
  const navigate = useNavigate();
  const mapWrapRef = useRef(null);
  const [hoverTip, setHoverTip] = useState(null);
  const metersImageCoords = useMemo(() => toMeterImageCoords(meters || []), [meters]);

  const tooltipPlacement = useMemo(() => {
    if (!hoverTip || !mapWrapRef.current) return null;
    const { clientWidth, clientHeight } = mapWrapRef.current;
    return computeTooltipPlacement(hoverTip.x, hoverTip.y, clientWidth, clientHeight);
  }, [hoverTip]);

  const openMeterDetail = (meterId) => {
    navigate(meterDetailUrl(meterId), {
      state: meterDetailNavigationState("/cartographie"),
    });
  };

  const showHoverTip = (event, meter, state) => {
    const map = event.target?._map;
    if (!map) return;
    const point = map.latLngToContainerPoint(event.latlng);
    setHoverTip({ meter, ...state, x: point.x, y: point.y });
  };

  const hideHoverTip = () => setHoverTip(null);

  return (
    <section className="card map-panel map-panel--meters">
      <h3>{title}</h3>
      {caption ? <p className="map-caption">{caption}</p> : null}
      <ul className="map-risk-legend" aria-label="Legende des couleurs compteurs">
        {METER_LEGEND_ITEMS.map(({ risk, label }) => (
          <li key={risk}>
            <span
              className={`map-risk-legend-dot ${risk === "no_data" ? "map-risk-legend-dot--nodata" : ""}`}
              style={{ background: METER_MAP_PATH_BY_RISK[risk]?.fillColor }}
            />
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
          className="map-leaflet map-leaflet--meters"
        >
          <PlanMapFitBounds bounds={PLAN_BOUNDS} mode="cover" />
          <ImageOverlay url={PLAN_COMPTEURS_URL} bounds={PLAN_BOUNDS} />
          {metersImageCoords.map((m) => {
            const state = resolveMeterMapRisk(m, anomalies, alerts);
            const {
              risk,
              anom,
              alert,
              displayProbability,
              anomalyScore,
              hasData,
              riskLabel: riskLabelText,
              riskSource,
            } = state;
            const opts = METER_MAP_PATH_BY_RISK[risk] || METER_MAP_PATH_BY_RISK.normal;
            const radius = risk === "no_data" ? 10 : markerRadiusForRisk(risk);
            return (
              <CircleMarker
                key={`${m.meter_id}-${risk}-${displayProbability ?? "na"}`}
                center={[m.y, m.x]}
                radius={radius}
                pathOptions={opts}
                className={risk === "no_data" ? "map-meter--nodata" : `map-meter--${risk}`}
                eventHandlers={{
                  mouseover: (e) => showHoverTip(e, m, state),
                  mouseout: hideHoverTip,
                  click: () => openMeterDetail(m.meter_id),
                }}
              >
                <Popup>
                  <MeterHoverTooltip
                    meter={m}
                    risk={risk}
                    riskLabelText={riskLabelText}
                    anom={anom}
                    alert={alert}
                    displayProbability={displayProbability}
                    anomalyScore={anomalyScore}
                    hasData={hasData}
                    riskSource={riskSource}
                  />
                  <Link
                    to={meterDetailUrl(m.meter_id)}
                    state={meterDetailNavigationState("/cartographie")}
                    className="map-popup-link"
                  >
                    Voir suivi detaille
                  </Link>
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>
        </div>
        {hoverTip && tooltipPlacement ? (
          <div
            className={`map-floating-tooltip map-floating-tooltip--${tooltipPlacement.placement}`}
            style={{ left: tooltipPlacement.left, top: tooltipPlacement.top }}
            role="tooltip"
          >
            <MeterHoverTooltip
              meter={hoverTip.meter}
              risk={hoverTip.risk}
              riskLabelText={hoverTip.riskLabel}
              anom={hoverTip.anom}
              alert={hoverTip.alert}
              displayProbability={hoverTip.displayProbability}
              anomalyScore={hoverTip.anomalyScore}
              hasData={hoverTip.hasData}
              riskSource={hoverTip.riskSource}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}
