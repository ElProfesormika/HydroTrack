import { CRS } from "leaflet";
import { CircleMarker, ImageOverlay, MapContainer, useMapEvents } from "react-leaflet";

import { PlanMapFitBounds } from "../PlanMapFit";
import { PLAN_BOUNDS, PLAN_HEIGHT, PLAN_WIDTH } from "../sitePlanCoordinates";
import { confirmClearSelection } from "../../utils/confirmDelete";

const PLAN_URL = {
  meters: "/plans/edf-plan.jpeg",
  sensors: "/plans/edf-plan.jpeg",
};

function MapClickHandler({ onPick, disabled }) {
  useMapEvents({
    click(e) {
      if (disabled) return;
      const x = Math.round(e.latlng.lng * 10) / 10;
      const y = Math.round(e.latlng.lat * 10) / 10;
      onPick(x, y);
    },
  });
  return null;
}

function toMarkers(variant, existingPoints, excludeId) {
  const markers = [];
  for (const p of existingPoints || []) {
    if (p.id === excludeId) continue;
    if (p.x == null || p.y == null) continue;
    markers.push({
      key: `${p.kind}-${p.id}`,
      x: p.x,
      y: p.y,
      radius: p.kind === "zone" ? 8 : 7,
      opacity: 0.92,
      color: p.kind === "meter" ? "#0d47a1" : p.kind === "zone" ? "#6a1b9a" : "#006064",
      fillColor: p.kind === "meter" ? "#64b5f6" : p.kind === "zone" ? "#ea80fc" : "#18ffff",
    });
  }
  return markers;
}

/**
 * Clic sur le plan pour definir plan_x / plan_y (coordonnees pixels du plan site).
 */
export function AdminPlanPicker({
  variant = "meters",
  planX,
  planY,
  onChange,
  existingPoints = [],
  excludeId = null,
  disabled = false,
  title = "Cliquez sur le plan pour placer le point",
}) {
  const hasPick =
    planX !== "" && planX != null && planY !== "" && planY != null && !Number.isNaN(Number(planX)) && !Number.isNaN(Number(planY));
  const pickX = hasPick ? Number(planX) : null;
  const pickY = hasPick ? Number(planY) : null;
  const refMarkers = toMarkers(variant, existingPoints, excludeId);

  return (
    <div className="admin-plan-picker">
      <div className="admin-plan-picker-header">
        <strong>{title}</strong>
        <span className="admin-plan-picker-coords">
          {hasPick ? (
            <>
              X = <code>{pickX}</code> · Y = <code>{pickY}</code>
            </>
          ) : (
            "Aucun point selectionne"
          )}
        </span>
        {hasPick ? (
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={() => {
              if (!confirmClearSelection("la position sur le plan")) return;
              onChange("", "");
            }}
            disabled={disabled}
          >
            Effacer
          </button>
        ) : null}
      </div>
      <div className="admin-plan-picker-map map-panel-fill map-panel-fill--network">
        <MapContainer
          center={[PLAN_HEIGHT / 2, PLAN_WIDTH / 2]}
          zoom={-1}
          crs={CRS.Simple}
          minZoom={-4}
          maxZoom={3}
          maxBounds={PLAN_BOUNDS}
          className="map-leaflet map-leaflet--admin-pick"
        >
          <PlanMapFitBounds bounds={PLAN_BOUNDS} mode="cover" />
          <ImageOverlay url={PLAN_URL[variant] || PLAN_URL.meters} bounds={PLAN_BOUNDS} />
          <MapClickHandler
            disabled={disabled}
            onPick={(x, y) => onChange(String(x), String(y))}
          />
          {refMarkers.map((m) => (
            <CircleMarker
              key={m.key}
              center={[m.y, m.x]}
              radius={m.radius}
              pathOptions={{
                color: m.color,
                fillColor: m.fillColor,
                fillOpacity: m.opacity,
                weight: 2.5,
              }}
            />
          ))}
          {hasPick ? (
            <CircleMarker
              center={[pickY, pickX]}
              radius={12}
              pathOptions={{
                color: "#b71c1c",
                fillColor: "#ff5252",
                fillOpacity: 1,
                weight: 3.5,
              }}
            />
          ) : null}
        </MapContainer>
      </div>
      <p className="map-caption admin-plan-picker-hint">
        {variant === "meters"
          ? "Plan compteurs : les points bleus sont les compteurs deja places."
          : "Bleu = compteurs · cyan = capteurs · violet = zones (centre des capteurs)."}
      </p>
    </div>
  );
}

export function pointsFromMeters(rows) {
  return (rows || [])
    .filter((r) => r.plan_x != null && r.plan_y != null)
    .map((r) => ({ id: r.meter_id, x: Number(r.plan_x), y: Number(r.plan_y), kind: "meter" }));
}

export function pointsFromZones(rows) {
  return (rows || [])
    .filter((r) => r.plan_x != null && r.plan_y != null)
    .map((r) => ({ id: String(r.zone_id), x: Number(r.plan_x), y: Number(r.plan_y), kind: "zone" }));
}

export function pointsFromSensors(rows) {
  return (rows || [])
    .filter((r) => r.plan_x != null && r.plan_y != null)
    .map((r) => ({ id: r.sensor_id, x: Number(r.plan_x), y: Number(r.plan_y), kind: "sensor" }));
}

export function combinedSensorMapPoints(zones, sensors, meters) {
  return [...pointsFromZones(zones), ...pointsFromSensors(sensors), ...pointsFromMeters(meters)];
}
