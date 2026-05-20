import { DashboardHeader } from "../components/DashboardHeader";
import { EventList } from "../components/EventList";
import { InsightCard } from "../components/InsightCard";
import { KpiCard } from "../components/KpiCard";
import { VariationChart } from "../components/VariationChart";
import { useRealtimeDashboard } from "../hooks/useRealtimeDashboard";
import { formatFlowM3h, formatVolumeM3 } from "../utils/formatUnits";

export function DashboardPage() {
  const { overview, timeseries, alerts, anomalies, mapMeters, sensorsCatalog, isConnected, error } =
    useRealtimeDashboard();

  const meter = overview?.meter_kpis || {};
  const sensors = overview?.sensor_kpis || {};
  const networkState = overview?.network_state || {};

  return (
    <div className="page">
      <DashboardHeader
        title="Synthese operationnelle"
        description="Vue globale du reseau : compteurs, capteurs pression, alertes actives et evolution du risque."
        isConnected={isConnected}
        onlineLabel="Backend connecte"
        offlineLabel="Backend deconnecte"
      />

      {error ? <p className="error-box">{error}</p> : null}

      <section className="kpi-grid">
        <KpiCard title="Compteurs suivis" value={meter.distinct_meters || 0} subtitle="Identifiants uniques" />
        <KpiCard title="Points compteurs" value={meter.total_points || 0} subtitle="Volume de telemetrie" />
        <KpiCard
          title="Debit moyen (typique)"
          value={formatFlowM3h(meter.avg_flow)}
          subtitle="Mediane des debits moyens par compteur (m³/h)"
        />
        <KpiCard
          title="Debit sources SEP"
          value={formatFlowM3h(meter.sep_sources_flow)}
          subtitle="Somme des 6 compteurs alimentes par le CSV SEP (m³/h)"
        />
        <KpiCard
          title="Volume consomme (SEP)"
          value={formatVolumeM3(meter.sep_total_volume)}
          subtitle="Index cumules des 6 sources sur la periode (m³)"
        />
        <KpiCard
          title="Capteurs pression"
          value={sensors.registry_sensor_count || sensors.distinct_sensors || 0}
          subtitle="Deployes sur le reseau"
        />
        <KpiCard
          title="Zones instrumentees"
          value={sensors.registry_zone_count || sensors.distinct_zones || 0}
          subtitle={`~${Math.round(sensors.zone_spacing_m || 300)} m entre capteurs`}
        />
        <KpiCard title="Intensite moyenne" value={Number(sensors.avg_intensity || 0).toFixed(2)} subtitle="Signal pression" />
        <KpiCard title="Alertes actives" value={networkState.active_alerts || 0} subtitle="Risque reseau" />
      </section>

      <VariationChart timeseries={timeseries} />

      <section className="split-grid">
        <InsightCard title="Tous les compteurs suivis">
          <div className="catalog-grid">
            {(mapMeters || []).map((meter) => (
              <div key={meter.meter_id} className="catalog-item">
                <strong>{meter.meter_id}</strong>
                <span>{meter.name || meter.meter_id}</span>
              </div>
            ))}
            {!mapMeters?.length ? <p className="empty-chart">Aucun compteur disponible.</p> : null}
          </div>
        </InsightCard>
        <InsightCard title="Tous les capteurs pression">
          <div className="catalog-grid">
            {(sensorsCatalog || []).map((sensor) => (
              <div key={`${sensor.sensor_id}-${sensor.zone}`} className="catalog-item">
                <strong>{sensor.sensor_id}</strong>
                <span>{sensor.zone || "Zone non renseignee"}</span>
              </div>
            ))}
            {!sensorsCatalog?.length ? (
              <p className="empty-chart">Aucun capteur encore ingere. Les capteurs apparaitront des la premiere telemetrie pression.</p>
            ) : null}
          </div>
        </InsightCard>
      </section>

      <InsightCard title="Comment sont calcules les debits ?">
        <p className="map-caption kpi-help-text">
          Chaque releve fournit un <strong>index cumule en m³</strong>. Entre deux dates : ΔV = index<sub>nouveau</sub>{" "}
          − index<sub>ancien</sub>, puis <strong>débit = ΔV / Δt</strong> avec Δt en heures → résultat en{" "}
          <strong>m³/h</strong>. Le debit <em>typique</em> est la <strong>mediane</strong> des debits moyens de chaque
          compteur (hors pics au-dela de {Number(meter.flow_cap_m3h || 2000).toFixed(0)} m³/h). Le debit{" "}
          <em>sources SEP</em> additionne uniquement les 6 compteurs lies aux colonnes du fichier SEP (mesure directe).
          Les 16 autres compteurs recoivent une <strong>estimation repartie</strong> : ne pas les additionner aux
          sources pour eviter un double comptage.
        </p>
      </InsightCard>

      <section className="split-grid">
        <EventList title="Points d'alertes recents" items={alerts} mode="alerts" />
        <InsightCard title="Lecture rapide">
          <div className="stat-inline">
            <div className="stat-pill">
              <strong>{networkState.latest_anomalies || 0}</strong>
              <span>Anomalies detectees</span>
            </div>
            <div className="stat-pill">
              <strong>{(overview?.top_anomalous_meters || []).length}</strong>
              <span>Compteurs les plus exposes</span>
            </div>
            <div className="stat-pill">
              <strong>{formatFlowM3h(meter.max_flow)}</strong>
              <span>Pic debit (hors aberrations)</span>
            </div>
          </div>
          <ul className="event-list event-list--compact">
            {anomalies.slice(0, 8).map((item, idx) => (
              <li key={`synth-anom-${idx}-${item.timestamp || "na"}`}>
                <strong>{item.meter_id || "N/A"}</strong>
                <p>
                  {new Date(item.timestamp).toLocaleString("fr-FR")} - score {Number(item.score || 0).toFixed(2)} /
                  fuite {Math.round(Number(item.leak_probability || 0) * 100)}%
                </p>
              </li>
            ))}
            {!anomalies.length ? <li>Aucune anomalie recente.</li> : null}
          </ul>
        </InsightCard>
      </section>
    </div>
  );
}
