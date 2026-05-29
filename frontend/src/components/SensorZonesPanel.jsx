import { LocalizationPhysicsDetail } from "./LeakPhysicsPanel";

function statusLabel(status) {
  const labels = {
    confirmed: "Fuite confirmee",
    pending: "Confirmation en cours",
    none: "RAS",
    normal: "Normal",
    caution: "Vigilance",
    warning: "Attention",
    critical: "Critique",
    offline: "Hors ligne",
  };
  return labels[status] || status;
}

function confirmationClass(status) {
  if (status === "confirmed") return "zone-card--confirmed";
  if (status === "pending") return "zone-card--pending";
  return "";
}

export function SensorZonesPanel({ zones, networkKm = "10.0", zoneSpacingM = 300 }) {
  if (!zones?.length) {
    return (
      <section className="card">
        <h3>Zones capteurs (troncons)</h3>
        <p className="map-caption">
          Reseau ~{networkKm} km. Aucune zone chargee. Utilisez POST /api/sensors/pressure ou le
          script seed_pressure_demo.py pour injecter des mesures.
        </p>
      </section>
    );
  }

  return (
    <section className="card sensor-zones-panel">
      <h3>Zones capteurs entre compteurs ({zones.length})</h3>
      <p className="map-caption">
        Reseau ~{networkKm} km : une zone tous les ~{zoneSpacingM} m (2 capteurs pression par troncon).
        En cas d&apos;alerte compteur, les capteurs detectent l&apos;onde transitoire, confirment la fuite
        puis estiment le point x = (L + c·Δt) / 2 et la zone estimee R autour de x.
      </p>
      <div className="zone-cards-grid">
        {zones.map((zone) => {
          const loc = zone.latest_localization;
          const confirmed = zone.confirmation_status === "confirmed";
          const seg = zone.segment;
          const wave = seg?.wave_speed_m_s ?? seg?.wave_physics?.wave_speed_m_s;

          return (
            <article
              key={zone.zone_id}
              className={`zone-card ${confirmationClass(zone.confirmation_status)}`}
            >
              <header className="zone-card-header">
                <strong>{zone.zone_name}</strong>
                <span className={`zone-badge zone-badge--${zone.confirmation_status}`}>
                  {statusLabel(zone.confirmation_status)}
                </span>
              </header>
              <p className="zone-card-segment">
                Troncon : {seg?.upstream_meter} → {seg?.downstream_meter} ({seg?.length_m} m)
                {wave != null ? (
                  <>
                    <br />
                    <span className="zone-card-wave">
                      c ≈ {Number(wave).toFixed(0)} m/s
                      {seg?.pipe_material_label ? ` · ${seg.pipe_material_label}` : ""}
                    </span>
                  </>
                ) : null}
              </p>
              {zone.pending_meter ? (
                <p className="zone-card-alert">
                  Alerte compteur : {zone.pending_meter.meter_id} (
                  {Math.round(Number(zone.pending_meter.leak_probability || 0) * 100)} %)
                </p>
              ) : null}
              <ul className="zone-sensors-list">
                {(zone.sensors || []).map((s) => (
                  <li key={s.sensor_id}>
                    <span className="zone-sensor-id">{s.sensor_id}</span>
                    <span className={`zone-sensor-status zone-sensor-status--${s.status}`}>
                      {statusLabel(s.status)}
                    </span>
                    {s.intensity != null ? (
                      <span className="zone-sensor-metric">I={Number(s.intensity).toFixed(0)}</span>
                    ) : null}
                    {s.frequency != null ? (
                      <span className="zone-sensor-metric">f={Number(s.frequency).toFixed(1)} Hz</span>
                    ) : null}
                  </li>
                ))}
              </ul>
              {confirmed && loc ? (
                <LocalizationPhysicsDetail localization={loc} segment={seg} />
              ) : (
                <p className="zone-card-score">
                  Score onde transitoire max : {Number(zone.max_sensor_score || 0).toFixed(2)}
                </p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
