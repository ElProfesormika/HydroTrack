import { CRS } from "leaflet";
import { useMemo, useRef, useState } from "react";
import { CircleMarker, ImageOverlay, MapContainer, Popup } from "react-leaflet";
import { useNavigate } from "react-router-dom";
import { PlanMapFitBounds } from "./PlanMapFit";
import { METER_PLAN_POINTS, PLAN_BOUNDS, PLAN_HEIGHT, PLAN_WIDTH } from "./sitePlanCoordinates";
import {
  MAP_LEGEND_ITEMS,
  MAP_PATH_BY_RISK,
  markerRadiusForRisk,
  riskFromLeak,
  riskLabel,
} from "../utils/riskLevels";

const PLAN_COMPTEURS_URL = "/plans/edf-plan.jpeg";

const METER_LEGEND_ITEMS = MAP_LEGEND_ITEMS.filter((item) => item.risk !== "offline");

const TOOLTIP_EST_WIDTH = 268;
const TOOLTIP_EST_HEIGHT = 210;
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

function latestAnomalyForMeter(meterId, anomalies) {
  const rows = (anomalies || []).filter((a) => a.meter_id === meterId);
  if (!rows.length) return null;
  return rows.reduce((best, cur) => {
    const tb = new Date(best.timestamp || 0).getTime();
    const tc = new Date(cur.timestamp || 0).getTime();
    return tc >= tb ? cur : best;
  });
}

function resolveMeterState(meter, anomalies) {
  const anom = latestAnomalyForMeter(meter.meter_id, anomalies) || meter.latest_anomaly || null;
  const leakP = anom ? Number(anom.leak_probability || 0) : 0;
  const risk = meter.risk_level || riskFromLeak(leakP);
  return { risk, anom, leakP };
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

function MeterHoverTooltip({ meter, risk, anom, leakP }) {
  const stateDate = anom?.timestamp ? formatDateTime(anom.timestamp) : formatDateTime(meter.last_reading_at);
  const stateLabel = riskLabel(risk);

  return (
    <div className="map-tooltip-inner">
      <strong>{meter.name}</strong>
      <span className="map-tooltip-id">{meter.meter_id}</span>
      <p className={`map-tooltip-risk map-tooltip-risk--${risk}`}>{stateLabel}</p>
      <dl className="map-tooltip-meta">
        <div>
          <dt>Etat au</dt>
          <dd>{stateDate}</dd>
        </div>
        {anom ? (
          <>
            <div>
              <dt>Score anomalie</dt>
              <dd>{Number(anom.score || 0).toFixed(2)}</dd>
            </div>
            <div>
              <dt>Prob. fuite</dt>
              <dd>{Math.round(leakP * 100)} %</dd>
            </div>
          </>
        ) : null}
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
            <div>
              <dt>Volume</dt>
              <dd>{Number(meter.last_volume || 0).toFixed(2)} m³</dd>
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
  title = "Carte des compteurs reseau",
  caption = "Survolez un point pour les infos. Couleur selon l'etat ML. Clic pour le suivi detaille.",
}) {
  const navigate = useNavigate();
  const mapWrapRef = useRef(null);
  const [hoverTip, setHoverTip] = useState(null);
  const metersImageCoords = toMeterImageCoords(meters || []);

  const tooltipPlacement = useMemo(() => {
    if (!hoverTip || !mapWrapRef.current) return null;
    const { clientWidth, clientHeight } = mapWrapRef.current;
    return computeTooltipPlacement(hoverTip.x, hoverTip.y, clientWidth, clientHeight);
  }, [hoverTip]);

  const openMeterDetail = (meterId) => {
    navigate(`/dashboard/compteurs?meter=${encodeURIComponent(meterId)}`);
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
      <ul className="map-risk-legend" aria-label="Legende des couleurs">
        {METER_LEGEND_ITEMS.map(({ risk, label }) => (
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
          className="map-leaflet map-leaflet--meters"
        >
          <PlanMapFitBounds bounds={PLAN_BOUNDS} mode="cover" />
          <ImageOverlay url={PLAN_COMPTEURS_URL} bounds={PLAN_BOUNDS} />
          {metersImageCoords.map((m) => {
            const { risk, anom, leakP } = resolveMeterState(m, anomalies);
            const opts = MAP_PATH_BY_RISK[risk] || MAP_PATH_BY_RISK.normal;
            return (
              <CircleMarker
                key={m.id}
                center={[m.y, m.x]}
                radius={markerRadiusForRisk(risk)}
                pathOptions={opts}
                eventHandlers={{
                  mouseover: (e) => showHoverTip(e, m, { risk, anom, leakP }),
                  mouseout: hideHoverTip,
                  click: () => openMeterDetail(m.meter_id),
                }}
              >
                <Popup>
                  <MeterHoverTooltip meter={m} risk={risk} anom={anom} leakP={leakP} />
                  <button type="button" className="map-popup-link" onClick={() => openMeterDetail(m.meter_id)}>
                    Voir suivi detaille
                  </button>
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
              anom={hoverTip.anom}
              leakP={hoverTip.leakP}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}
