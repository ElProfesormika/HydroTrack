import { CRS } from "leaflet";
import { useMemo } from "react";
import { Circle, CircleMarker, ImageOverlay, MapContainer, Polyline, Popup } from "react-leaflet";
import { PlanMapFitBounds } from "./PlanMapFit";
import { PLAN_BOUNDS, PLAN_HEIGHT, PLAN_WIDTH, metersToPlanRadius } from "./sitePlanCoordinates";
import { buildMeterLookup, sensorMapCoords } from "../utils/planCoordinates";
import { buildZoneSegments } from "../utils/sensorNetworkPath";
import { interpolateOnSegment, leakZoneOnSegment, resolveLeakPlanCoords } from "../utils/leakLocalization";
import { sensorMapMarkerPathOptions, sensorMapMarkerRadius } from "../utils/riskLevels";

const PLAN_CAPTEURS_URL = "/plans/edf-plan.jpeg";

const HIGHLIGHT_SEGMENT_STYLE = {
  color: "#0d47a1",
  weight: 8,
  opacity: 1,
  lineCap: "round",
};

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

const SENSOR_HIGHLIGHT_STYLE = {
  color: "#ffffff",
  fillColor: "#2e7d32",
  fillOpacity: 1,
  weight: 3,
};

function toSensorCoords(sensors, meterLookup) {
  return (sensors || []).map((sensor, index) => {
    const pt = sensorMapCoords(sensor, null, meterLookup);
    if (pt.x != null && pt.y != null) return pt;
    return { ...sensor, x: 240 + (index % 8) * 60, y: 420 + Math.floor(index / 8) * 60 };
  });
}

export function LocalizationResultMap({
  localization,
  zoneId,
  sensors = [],
  meters = [],
  zones = [],
  highlightSensorId = "",
  title = "Plan — point de fuite et zone d'incertitude",
}) {
  const meterLookup = useMemo(() => buildMeterLookup(meters), [meters]);
  const sensorsCoords = useMemo(() => toSensorCoords(sensors, meterLookup), [sensors, meterLookup]);
  const zoneSegments = useMemo(
    () => buildZoneSegments(sensorsCoords, zones),
    [sensorsCoords, zones]
  );

  const segment = useMemo(
    () => zoneSegments.find((s) => Number(s.zoneId) === Number(zoneId)),
    [zoneSegments, zoneId]
  );

  const leakMarker = useMemo(() => {
    if (!localization || !segment) return null;
    const plan = resolveLeakPlanCoords(localization, segment);
    if (!plan) return null;

    const lengthM = localization.segment_length_m ?? segment.zone?.segment?.length_m ?? 300;
    const radiusM = localization.leak_radius_m ?? 5;
    const dist = localization.distance_m_from_upstream;

    let zoneLine = null;
    if (segment.positions?.length >= 2) {
      if (localization.leak_zone_ratio_start != null && localization.leak_zone_ratio_end != null) {
        const p0 = interpolateOnSegment(segment.positions, localization.leak_zone_ratio_start);
        const p1 = interpolateOnSegment(segment.positions, localization.leak_zone_ratio_end);
        zoneLine = p0 && p1 ? [[p0.y, p0.x], [p1.y, p1.x]] : null;
      }
      if (!zoneLine && dist != null) {
        zoneLine = leakZoneOnSegment(segment.positions, dist, lengthM, radiusM);
      }
    }

    return {
      ...localization,
      x: plan.x,
      y: plan.y,
      leak_radius_m: radiusM,
      zoneLine,
      segment_length_m: lengthM,
    };
  }, [localization, segment]);

  if (!localization) {
    return (
      <section className="card localization-result-map localization-result-map--empty">
        <h3>{title}</h3>
        <p className="map-caption">Selectionnez une localisation confirmee pour afficher le plan.</p>
      </section>
    );
  }

  if (!segment || !leakMarker) {
    return (
      <section className="card localization-result-map localization-result-map--empty">
        <h3>{title}</h3>
        <p className="map-caption">
          Coordonnees plan indisponibles pour cette zone. Verifiez la cartographie capteurs.
        </p>
      </section>
    );
  }

  return (
    <section className="card localization-result-map">
      <h3>{title}</h3>
      <p className="map-caption">
        Point rouge = fuite estimee (x). Trait epais = zone R sur le troncon. Cercle pointille = rayon
        d&apos;incertitude autour de x.
      </p>
      <div className="localization-result-map__canvas">
        <MapContainer
          center={[segment.midpoint[0], segment.midpoint[1]]}
          zoom={0}
          crs={CRS.Simple}
          minZoom={-2}
          maxZoom={4}
          maxBounds={PLAN_BOUNDS}
          className="map-leaflet map-leaflet--localization"
        >
          <PlanMapFitBounds bounds={PLAN_BOUNDS} mode="cover" />
          <ImageOverlay url={PLAN_CAPTEURS_URL} bounds={PLAN_BOUNDS} />

          <Polyline positions={segment.positions} pathOptions={HIGHLIGHT_SEGMENT_STYLE} />

          {sensorsCoords.map((sensor) => {
            const highlighted = highlightSensorId && sensor.sensor_id === highlightSensorId;
            const opts = highlighted ? SENSOR_HIGHLIGHT_STYLE : sensorMapMarkerPathOptions(false);
            return (
              <CircleMarker
                key={sensor.sensor_id}
                center={[sensor.y, sensor.x]}
                radius={highlighted ? sensorMapMarkerRadius() + 2 : sensorMapMarkerRadius()}
                pathOptions={opts}
              >
                <Popup>
                  <strong>{sensor.sensor_id}</strong>
                  {highlighted ? (
                    <>
                      <br />
                      Capteur de reference
                    </>
                  ) : null}
                </Popup>
              </CircleMarker>
            );
          })}

          {leakMarker.zoneLine ? (
            <Polyline positions={leakMarker.zoneLine} pathOptions={LEAK_ZONE_SPAN_STYLE} />
          ) : null}
          {leakMarker.leak_radius_m != null ? (
            <Circle
              center={[leakMarker.y, leakMarker.x]}
              radius={metersToPlanRadius(leakMarker.leak_radius_m)}
              pathOptions={LEAK_RADIUS_CIRCLE_STYLE}
            />
          ) : null}
          <CircleMarker center={[leakMarker.y, leakMarker.x]} radius={9} pathOptions={LEAK_POINT_STYLE}>
            <Popup>
              <strong>Point de fuite estime</strong>
              <br />
              x = {Number(leakMarker.distance_m_from_upstream || 0).toFixed(0)} m depuis{" "}
              {leakMarker.upstream_meter}
              <br />
              R ≈ {Number(leakMarker.leak_radius_m || 0).toFixed(0)} m
            </Popup>
          </CircleMarker>
        </MapContainer>
      </div>
      <ul className="localization-result-map-legend">
        <li>
          <span className="map-risk-legend-dot map-risk-legend-dot--leak-point" />
          Point x
        </li>
        <li>
          <span className="map-risk-legend-line map-risk-legend-line--leak-span" />
          Zone R sur troncon
        </li>
        <li>
          <span className="map-risk-legend-line" style={{ borderTop: "2px dashed #c62828" }} />
          Rayon d&apos;incertitude
        </li>
        {highlightSensorId ? (
          <li>
            <span className="map-risk-legend-dot" style={{ background: "#2e7d32" }} />
            Capteur {highlightSensorId}
          </li>
        ) : null}
      </ul>
    </section>
  );
}
