import { useEffect, useState } from "react";
import { DashboardHeader } from "../components/DashboardHeader";
import { EventList } from "../components/EventList";
import { InsightCard } from "../components/InsightCard";
import { KpiCard } from "../components/KpiCard";
import { LeakPhysicsPanel } from "../components/LeakPhysicsPanel";
import { PressureIntensityChart } from "../components/PressureIntensityChart";
import { SensorZonesPanel } from "../components/SensorZonesPanel";
import { hydroApi } from "../services/api";
import { useRealtimeDashboard } from "../hooks/useRealtimeDashboard";

export function DashboardCapteursPage() {
  const { overview, pressureSeries, alerts, zoneSensors, leakLocalizations, isConnected, error } =
    useRealtimeDashboard();
  const [wavePhysics, setWavePhysics] = useState(null);

  useEffect(() => {
    hydroApi
      .getWavePhysics()
      .then(setWavePhysics)
      .catch(() => setWavePhysics(null));
  }, []);

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

  const avgWaveSpeed =
    confirmedLeaks.length > 0
      ? confirmedLeaks.reduce((s, l) => s + Number(l.wave_speed_m_s || 0), 0) / confirmedLeaks.length
      : null;

  const pressureAlerts = (alerts || []).filter(
    (a) =>
      String(a.category || "").includes("leak") ||
      String(a.source_id || "").startsWith("S_Z")
  );

  return (
    <div className="page">
      <DashboardHeader
        title="Suivi capteurs pression"
        description={`Reseau eau potable ~${networkKm} km : ${zoneCount} zones (~${spacingM} m). Detection et localisation de fuite par ondes de pression transitoires entre capteurs amont/aval.`}
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
        <KpiCard title="Zones en analyse" value={pendingZones} subtitle="Onde transitoire en cours" />
        <KpiCard title="Fuites confirmees" value={confirmedZones} subtitle="Capteurs + compteur" />
        <KpiCard title="Localisations" value={confirmedLeaks.length} subtitle="x + zone R estimee" />
        <KpiCard
          title="Vitesse onde (moy.)"
          value={avgWaveSpeed != null ? Number(avgWaveSpeed).toFixed(0) : "—"}
          subtitle="c sur fuites confirmees (m/s)"
        />
        <KpiCard
          title="Intensite moyenne"
          value={Number(sensors.avg_intensity || 0).toFixed(2)}
          subtitle="Signal transitoire"
        />
        <KpiCard
          title="Intensite max"
          value={Number(sensors.max_intensity || 0).toFixed(2)}
          subtitle="Pic observe"
        />
      </section>

      <LeakPhysicsPanel reference={wavePhysics} />

      <SensorZonesPanel zones={zoneSensors} networkKm={networkKm} zoneSpacingM={spacingM} />

      <PressureIntensityChart series={pressureSeries} />

      <section className="split-grid">
        <EventList
          title="Alertes capteurs / fuites localisees"
          items={pressureAlerts.length ? pressureAlerts : alerts}
          mode="alerts"
        />
        <InsightCard title="Pipeline de detection (physique)">
          <ol className="pipeline-steps">
            <li>
              <strong>1. Compteur (ML)</strong> — IsolationForest signale une anomalie de debit ; probabilite
              de fuite sur le troncon.
            </li>
            <li>
              <strong>2. Onde transitoire</strong> — Les 2 capteurs pression mesurent l&apos;arrivee de
              l&apos;onde (intensite, frequence, signal de pression).
            </li>
            <li>
              <strong>3. Vitesse c</strong> — Calcul depuis K (eau), E (materiau), D et e du tuyau : c =
              √( (K/ρ) / (1 + (K·D)/(E·e)) ).
            </li>
            <li>
              <strong>4. Confirmation</strong> — Fuite confirmee si compteur + pression + correlation +
              signature transitoire coherents.
            </li>
            <li>
              <strong>5. Localisation</strong> — Point x = (L + c·Δt) / 2 depuis le capteur amont (Δt =
              decalage d&apos;arrivee entre capteurs).
            </li>
            <li>
              <strong>6. Zone estimee R</strong> — Rayon tres reduit autour de x (incertitude metrologique),
              pas l&apos;etendue reelle de la fuite : R ≈ (c·δΔt)/2 + (1−confiance)·L·10 %.
            </li>
          </ol>
        </InsightCard>
      </section>
    </div>
  );
}
