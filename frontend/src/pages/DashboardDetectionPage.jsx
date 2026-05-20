import { Link } from "react-router-dom";

import { DashboardHeader } from "../components/DashboardHeader";
import { EventList } from "../components/EventList";
import { InsightCard } from "../components/InsightCard";
import { KpiCard } from "../components/KpiCard";
import { TopMetersBarChart } from "../components/TopMetersBarChart";
import { useRealtimeDashboard } from "../hooks/useRealtimeDashboard";
import { MAP_LEGEND_ITEMS, RISK_COLORS, riskFromLeak } from "../utils/riskLevels";

function latestAnomalyPerMeter(items) {
  const byMeter = {};
  for (const row of items || []) {
    const mid = row.meter_id;
    if (!mid) continue;
    const ts = new Date(row.timestamp || 0).getTime();
    const prev = byMeter[mid];
    if (!prev || ts >= new Date(prev.timestamp || 0).getTime()) {
      byMeter[mid] = row;
    }
  }
  return Object.values(byMeter);
}

export function DashboardDetectionPage() {
  const { overview, anomalies, isConnected, error } = useRealtimeDashboard();
  const network = overview?.network_state || {};
  const meterKpis = overview?.meter_kpis || {};
  const topMeters = overview?.top_anomalous_meters || [];

  const latestByMeter = latestAnomalyPerMeter(anomalies);
  const atRiskCount = latestByMeter.filter((a) => riskFromLeak(a.leak_probability) !== "normal").length;
  const maxLeak = latestByMeter.reduce((m, a) => Math.max(m, Number(a.leak_probability || 0)), 0);
  const topExposure = topMeters[0];

  return (
    <div className="page">
      <DashboardHeader
        title="Detection ML"
        description="Analyse IsolationForest sur chaque compteur (releves d'index en m³). Produit un score d'anomalie et une probabilite de fuite — declenche ensuite la verification pression sur le troncon."
        isConnected={isConnected}
      />

      {error ? <p className="error-box">{error}</p> : null}

      <section className="kpi-grid">
        <KpiCard
          title="Compteurs analyses"
          value={meterKpis.distinct_meters || 0}
          subtitle="Sous surveillance ML"
        />
        <KpiCard
          title="Compteurs en alerte"
          value={atRiskCount}
          subtitle="Dernier score : vigilence ou plus"
        />
        <KpiCard
          title="Anomalies enregistrees"
          value={network.latest_anomalies ?? 0}
          subtitle="Historique en base"
        />
        <KpiCard
          title="Pic probabilite fuite"
          value={`${Math.round(maxLeak * 100)} %`}
          subtitle="Dernier etat connu par compteur"
        />
      </section>

      <section className="split-grid charts-two-debit">
        <TopMetersBarChart items={topMeters} title="Classement par nombre d'anomalies" />
        <InsightCard title="Echelle de risque (probabilite de fuite)">
          <ul className="map-risk-legend map-risk-legend--stacked">
            {MAP_LEGEND_ITEMS.filter((item) => item.risk !== "offline").map(({ risk, label }) => (
              <li key={risk}>
                <span
                  className="map-risk-legend-dot"
                  style={{ background: RISK_COLORS[risk] }}
                  aria-hidden
                />
                <span>
                  <strong>{label}</strong>
                  {risk === "normal" ? " — < 25 %" : null}
                  {risk === "caution" ? " — 25 à 49 %" : null}
                  {risk === "warning" ? " — 50 à 74 %" : null}
                  {risk === "critical" ? " — ≥ 75 %" : null}
                </span>
              </li>
            ))}
          </ul>
          {topExposure ? (
            <p className="map-caption detection-top-meter">
              Compteur le plus signale : <strong>{topExposure.meter_id}</strong> (
              {topExposure.anomaly_count} anomalies, score moyen {Number(topExposure.avg_score || 0).toFixed(2)}).
            </p>
          ) : (
            <p className="map-caption">Aucun compteur significativement signale pour le moment.</p>
          )}
        </InsightCard>
      </section>

      <EventList title="Dernieres detections" items={anomalies} mode="anomalies" />

      <p className="map-caption detection-footer-hint">
        Detail par compteur (debits, volumes, courbes) :{" "}
        <Link to="/dashboard/compteurs">Suivi compteurs</Link>
        {" · "}
        Confirmation pression et localisation :{" "}
        <Link to="/dashboard/capteurs">Suivi capteurs</Link>
      </p>
    </div>
  );
}
