import { DashboardHeader } from "../components/DashboardHeader";
import { EventList } from "../components/EventList";
import { InsightCard } from "../components/InsightCard";
import { KpiCard } from "../components/KpiCard";
import { PressureIntensityChart } from "../components/PressureIntensityChart";
import { SensorZonesPanel } from "../components/SensorZonesPanel";
import { useRealtimeDashboard } from "../hooks/useRealtimeDashboard";

export function DashboardCapteursPage() {
  const { overview, pressureSeries, alerts, zoneSensors, leakLocalizations, isConnected, error } =
    useRealtimeDashboard();
  const sensors = overview?.sensor_kpis || {};

  const zoneCount = sensors.registry_zone_count ?? zoneSensors?.length ?? 0;
  const deployedCount = sensors.registry_sensor_count ?? zoneCount * 2;
  const spacingM = Math.round(sensors.zone_spacing_m || 300);
  const networkKm = ((sensors.network_length_m || 10000) / 1000).toFixed(1);

  const sensorsOnline = (zoneSensors || []).reduce(
    (n, z) => n + (z.sensors || []).filter((s) => s.status && s.status !== "offline").length,
    0
  );

  const confirmedLeaks = (leakLocalizations || []).filter((l) => l.confirmed);
  const pendingZones = (zoneSensors || []).filter((z) => z.confirmation_status === "pending").length;
  const confirmedZones = (zoneSensors || []).filter((z) => z.confirmation_status === "confirmed").length;

  const pressureAlerts = (alerts || []).filter(
    (a) =>
      String(a.category || "").includes("leak") ||
      String(a.source_id || "").startsWith("S_Z")
  );

  return (
    <div className="page">
      <DashboardHeader
        title="Suivi capteurs pression"
        description={`Reseau eau potable ~${networkKm} km : ${zoneCount} zones capteurs (~${spacingM} m). Confirmation de fuite par ondes de pression, puis localisation sur le troncon.`}
        isConnected={isConnected}
      />

      {error ? <p className="error-box">{error}</p> : null}

      <section className="kpi-grid">
        <KpiCard
          title="Points capteurs"
          value={sensors.total_points || 0}
          subtitle="Mesures pression enregistrees"
        />
        <KpiCard
          title="Capteurs deployes"
          value={deployedCount}
          subtitle={`2 par zone × ${zoneCount} zones`}
        />
        <KpiCard
          title="Capteurs en ligne"
          value={sensorsOnline}
          subtitle={`Sur ${deployedCount} deployes`}
        />
        <KpiCard
          title="Zones actives"
          value={zoneCount}
          subtitle={`Troncons instrumentes (~${spacingM} m)`}
        />
        <KpiCard title="Zones en analyse" value={pendingZones} subtitle="Confirmation en cours" />
        <KpiCard title="Fuites confirmees" value={confirmedZones} subtitle="Capteurs + compteur" />
        <KpiCard title="Localisations" value={confirmedLeaks.length} subtitle="Distance estimee" />
        <KpiCard
          title="Intensite moyenne"
          value={Number(sensors.avg_intensity || 0).toFixed(2)}
          subtitle="Signal (mesures recues)"
        />
        <KpiCard
          title="Intensite max"
          value={Number(sensors.max_intensity || 0).toFixed(2)}
          subtitle="Pic observe"
        />
      </section>

      <SensorZonesPanel zones={zoneSensors} networkKm={networkKm} zoneSpacingM={spacingM} />

      <PressureIntensityChart series={pressureSeries} />

      <section className="split-grid">
        <EventList
          title="Alertes capteurs / fuites localisees"
          items={pressureAlerts.length ? pressureAlerts : alerts}
          mode="alerts"
        />
        <InsightCard title="Pipeline de detection">
          <ol className="pipeline-steps">
            <li>
              <strong>1. Compteur</strong> — Le ML signale une anomalie sur un troncon (probabilite de fuite).
            </li>
            <li>
              <strong>2. Zone</strong> — Les 2 capteurs pression de la zone (~{spacingM} m) analysent le signal et la
              correlation inter-capteurs.
            </li>
            <li>
              <strong>3. Confirmation</strong> — Fuite confirmee si compteur + pression + correlation sont coherents.
            </li>
            <li>
              <strong>4. Localisation</strong> — Distance estimee depuis le compteur amont (modele temps de transit /
              amplitudes).
            </li>
          </ol>
        </InsightCard>
      </section>
    </div>
  );
}
