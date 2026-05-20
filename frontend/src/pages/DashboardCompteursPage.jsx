import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";

import { DashboardHeader } from "../components/DashboardHeader";
import { EventList } from "../components/EventList";
import { InsightCard } from "../components/InsightCard";
import { KpiCard } from "../components/KpiCard";
import { MeterDeepDivePanel } from "../components/MeterDeepDivePanel";
import { MeterFlowChart } from "../components/MeterFlowChart";
import { Link } from "react-router-dom";
import { MetersTrendChart } from "../components/MetersTrendChart";
import { TopMetersBarChart } from "../components/TopMetersBarChart";
import { VariationChart } from "../components/VariationChart";
import { useRealtimeDashboard } from "../hooks/useRealtimeDashboard";
import { formatFlowM3h, formatVolumeM3 } from "../utils/formatUnits";

export function DashboardCompteursPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const deepDiveRef = useRef(null);
  const scrolledFromMapRef = useRef(false);
  const {
    overview,
    timeseries,
    meterFlowSeries,
    meterFlowPerMeter,
    alerts,
    mapMeters,
    selectedMeterId,
    selectedMeterProfile,
    isConnected,
    error,
    refresh,
    setSelectedMeter,
  } = useRealtimeDashboard();
  const meter = overview?.meter_kpis || {};
  const topMeters = overview?.top_anomalous_meters || [];
  const meterOptions = (mapMeters || []).map((m) => m.meter_id).filter(Boolean);
  const meterFromUrl = searchParams.get("meter");

  useEffect(() => {
    if (!meterFromUrl || !meterOptions.length) return;
    if (!meterOptions.includes(meterFromUrl)) return;
    if (meterFromUrl !== selectedMeterId) {
      scrolledFromMapRef.current = false;
      setSelectedMeter(meterFromUrl);
    }
  }, [meterFromUrl, meterOptions, selectedMeterId, setSelectedMeter]);

  useEffect(() => {
    if (!meterFromUrl || !selectedMeterProfile || scrolledFromMapRef.current) return;
    if (selectedMeterId !== meterFromUrl) return;
    deepDiveRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    scrolledFromMapRef.current = true;
  }, [meterFromUrl, selectedMeterId, selectedMeterProfile]);

  function handleMeterChange(meterId) {
    setSelectedMeter(meterId);
    setSearchParams(meterId ? { meter: meterId } : {}, { replace: true });
  }

  return (
    <div className="page">
      <DashboardHeader
        title="Suivi compteurs"
        description="Pilotage detaille des debits, volumes et signaux de risque pour chaque compteur avec classification ML uniforme."
        isConnected={isConnected}
      />

      {error ? <p className="error-box">{error}</p> : null}

      <article className="card releves-promo-card">
        <h3>Saisie des releves</h3>
        <p className="map-caption">
          Saisissez l&apos;index compteur (m³) a la date du releve — le debit est calcule automatiquement.
        </p>
        <Link to="/releves" className="btn-primary releves-promo-link">
          Ouvrir la page Releves
        </Link>
      </article>

      <section className="kpi-grid">
        <KpiCard title="Compteurs distincts" value={meter.distinct_meters || 0} subtitle="Identifiants actifs" />
        <KpiCard title="Points télémetrie" value={meter.total_points || 0} subtitle="Mesures enregistrées" />
        <KpiCard title="Debit moyen (typique)" value={formatFlowM3h(meter.avg_flow)} subtitle="Mediane par compteur (m³/h)" />
        <KpiCard title="Debit sources SEP" value={formatFlowM3h(meter.sep_sources_flow)} subtitle="6 compteurs CSV (m³/h)" />
        <KpiCard title="Debit max (filtre)" value={formatFlowM3h(meter.max_flow)} subtitle="Hors pics aberrants" />
        <KpiCard title="Volume SEP" value={formatVolumeM3(meter.sep_total_volume)} subtitle="6 sources, periode (m³)" />
      </section>

      <section className="split-grid charts-two-debit">
        <MeterFlowChart series={meterFlowSeries} />
        <TopMetersBarChart items={topMeters} />
      </section>

      <MetersTrendChart buckets={meterFlowPerMeter?.buckets} series={meterFlowPerMeter?.series} />
      <div ref={deepDiveRef} id="suivi-detail-compteur" className="suivi-detail-anchor">
        <MeterDeepDivePanel
          meterId={selectedMeterId}
          meterOptions={meterOptions}
          profile={selectedMeterProfile}
          onChangeMeter={handleMeterChange}
        />
      </div>

      <VariationChart timeseries={timeseries} />

      <section className="split-grid">
        <EventList title="Alertes compteurs" items={alerts} mode="alerts" />
        <InsightCard title="Lien avec la detection ML">
          <p className="map-caption">
            Chaque releve d&apos;index declenche le modele (IsolationForest). Scores, probabilites de fuite et
            classement des compteurs : page{" "}
            <Link to="/dashboard/detection">Detection ML</Link>.
          </p>
        </InsightCard>
      </section>
    </div>
  );
}
