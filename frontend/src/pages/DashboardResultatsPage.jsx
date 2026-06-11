import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { DashboardHeader } from "../components/DashboardHeader";
import { KpiCard } from "../components/KpiCard";
import { LocalizationPhysicsDetail } from "../components/LeakPhysicsPanel";
import { LocalizationResultMap } from "../components/LocalizationResultMap";
import { hydroApi } from "../services/api";
import { useRealtimeDashboard } from "../hooks/useRealtimeDashboard";

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

function zoneSensorIds(zone) {
  return (zone?.sensors || []).map((s) => s.sensor_id).filter(Boolean);
}

function localizationMatchesSensor(loc, sensorId, zoneSensorList) {
  if (!sensorId) return true;
  if (loc.trigger_sensor_id === sensorId) return true;
  return zoneSensorList.includes(sensorId);
}

function enrichLocalization(loc, zoneSensors) {
  const zone = (zoneSensors || []).find((z) => Number(z.zone_id) === Number(loc.zone_id));
  return {
    ...loc,
    zone_name: loc.zone_name || zone?.zone_name || `Zone ${loc.zone_id}`,
    segment: zone?.segment,
  };
}

export function DashboardResultatsPage() {
  const {
    zoneSensors,
    leakLocalizations,
    mapSensors,
    mapZones,
    mapMeters,
    isConnected,
    error,
  } = useRealtimeDashboard();

  const [history, setHistory] = useState([]);
  const [filterZone, setFilterZone] = useState("");
  const [filterSensor, setFilterSensor] = useState("");
  const [confirmedOnly, setConfirmedOnly] = useState(true);
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    hydroApi
      .getLeakLocalizations(50, confirmedOnly)
      .then((res) => setHistory(res.items || []))
      .catch(() => setHistory([]));
  }, [confirmedOnly, leakLocalizations]);

  const allLocalizations = useMemo(() => {
    const merged = new Map();
    for (const loc of [...history, ...(leakLocalizations || [])]) {
      const id = loc.id ?? `${loc.zone_id}-${loc.timestamp}`;
      if (!merged.has(id)) merged.set(id, loc);
    }
    return Array.from(merged.values())
      .map((loc) => enrichLocalization(loc, zoneSensors))
      .sort((a, b) => String(b.timestamp || "").localeCompare(String(a.timestamp || "")));
  }, [history, leakLocalizations, zoneSensors]);

  const selectedZone = useMemo(
    () => (zoneSensors || []).find((z) => String(z.zone_id) === filterZone),
    [zoneSensors, filterZone]
  );

  const sensorOptions = useMemo(() => {
    if (!selectedZone) return [];
    return selectedZone.sensors || [];
  }, [selectedZone]);

  const filteredResults = useMemo(() => {
    const zoneSensorList = zoneSensorIds(selectedZone);
    return allLocalizations.filter((loc) => {
      if (filterZone && Number(loc.zone_id) !== Number(filterZone)) return false;
      if (!localizationMatchesSensor(loc, filterSensor, zoneSensorList)) return false;
      if (confirmedOnly && !loc.confirmed) return false;
      return true;
    });
  }, [allLocalizations, filterZone, filterSensor, selectedZone, confirmedOnly]);

  const selectedResult = useMemo(() => {
    if (selectedId != null) {
      const found = filteredResults.find((r) => (r.id ?? `${r.zone_id}-${r.timestamp}`) === selectedId);
      if (found) return found;
    }
    return filteredResults[0] || null;
  }, [filteredResults, selectedId]);

  useEffect(() => {
    if (!filteredResults.length) {
      setSelectedId(null);
      return;
    }
    const currentKey = selectedId;
    const stillVisible = filteredResults.some((r) => (r.id ?? `${r.zone_id}-${r.timestamp}`) === currentKey);
    if (!stillVisible) {
      const first = filteredResults[0];
      setSelectedId(first.id ?? `${first.zone_id}-${first.timestamp}`);
    }
  }, [filteredResults, selectedId]);

  const zoneSensorsForMap = useMemo(() => {
    if (!selectedResult) return [];
    const zid = Number(selectedResult.zone_id);
    return (mapSensors || []).filter((s) => Number(s.zone_id) === zid);
  }, [mapSensors, selectedResult]);

  const avgConfidence =
    filteredResults.length > 0
      ? filteredResults.reduce((s, r) => s + Number(r.localization_confidence || 0), 0) / filteredResults.length
      : null;

  const avgRadius =
    filteredResults.length > 0
      ? filteredResults.reduce((s, r) => s + Number(r.leak_radius_m || 0), 0) / filteredResults.length
      : null;

  return (
    <div className="page">
      <DashboardHeader
        title="Resultats de localisation"
        description="Point de fuite estime (x) et rayon d'incertitude (R) par zone et capteur pression, calcules par ondes transitoires entre capteurs amont et aval."
        isConnected={isConnected}
      />

      {error ? <p className="error-box">{error}</p> : null}

      <section className="card resultats-filters">
        <h3>Filtres zone et capteur</h3>
        <div className="resultats-filters__grid">
          <label className="meter-select-label">
            Zone
            <select
              value={filterZone}
              onChange={(e) => {
                setFilterZone(e.target.value);
                setFilterSensor("");
              }}
            >
              <option value="">Toutes les zones</option>
              {(zoneSensors || []).map((z) => (
                <option key={z.zone_id} value={String(z.zone_id)}>
                  {z.zone_name || `Zone ${z.zone_id}`}
                </option>
              ))}
            </select>
          </label>
          <label className="meter-select-label">
            Capteur
            <select
              value={filterSensor}
              onChange={(e) => setFilterSensor(e.target.value)}
              disabled={!filterZone}
            >
              <option value="">Tous les capteurs de la zone</option>
              {sensorOptions.map((s) => (
                <option key={s.sensor_id} value={s.sensor_id}>
                  {s.sensor_id}
                </option>
              ))}
            </select>
          </label>
          <label className="resultats-checkbox">
            <input
              type="checkbox"
              checked={confirmedOnly}
              onChange={(e) => setConfirmedOnly(e.target.checked)}
            />
            Fuites confirmees uniquement
          </label>
        </div>
        {selectedZone ? (
          <p className="map-caption">
            Troncon {selectedZone.segment?.upstream_meter} → {selectedZone.segment?.downstream_meter} (
            {selectedZone.segment?.length_m} m) — capteurs {zoneSensorIds(selectedZone).join(" / ")}
          </p>
        ) : null}
      </section>

      <section className="kpi-grid">
        <KpiCard title="Resultats" value={filteredResults.length} subtitle="Localisations affichees" />
        <KpiCard
          title="Confiance moyenne"
          value={avgConfidence != null ? `${Math.round(avgConfidence * 100)} %` : "—"}
          subtitle="Sur la selection"
        />
        <KpiCard
          title="Rayon R moyen"
          value={avgRadius != null ? `${avgRadius.toFixed(1)} m` : "—"}
          subtitle="Incertitude metrologique"
        />
        <KpiCard
          title="Point x"
          value={
            selectedResult?.distance_m_from_upstream != null
              ? `${Number(selectedResult.distance_m_from_upstream).toFixed(0)} m`
              : "—"
          }
          subtitle={
            selectedResult?.upstream_meter
              ? `Depuis ${selectedResult.upstream_meter}`
              : "Selection courante"
          }
        />
      </section>

      <section className="resultats-layout">
        <article className="card resultats-list-card">
          <h3>Historique des calculs</h3>
          <p className="map-caption">
            x = (L + c·Δt) / 2 depuis le capteur amont · R = zone d&apos;incertitude autour de x
          </p>
          <div className="releves-table-wrap">
            <table className="releves-table resultats-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Zone</th>
                  <th>Point x</th>
                  <th>Rayon R</th>
                  <th>Confiance</th>
                  <th>Capteur</th>
                </tr>
              </thead>
              <tbody>
                {filteredResults.length ? (
                  filteredResults.map((row) => {
                    const rowKey = row.id ?? `${row.zone_id}-${row.timestamp}`;
                    const active = selectedResult && (selectedResult.id ?? `${selectedResult.zone_id}-${selectedResult.timestamp}`) === rowKey;
                    return (
                      <tr
                        key={rowKey}
                        className={active ? "releves-row-active" : ""}
                        onClick={() => setSelectedId(rowKey)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") setSelectedId(rowKey);
                        }}
                      >
                        <td>{formatDateTime(row.timestamp)}</td>
                        <td>
                          {row.zone_name || `Zone ${row.zone_id}`}
                          <small>
                            {row.upstream_meter} → {row.downstream_meter}
                          </small>
                        </td>
                        <td>
                          {row.distance_m_from_upstream != null
                            ? `${Number(row.distance_m_from_upstream).toFixed(0)} m`
                            : "—"}
                        </td>
                        <td>
                          {row.leak_radius_m != null ? `${Number(row.leak_radius_m).toFixed(0)} m` : "—"}
                        </td>
                        <td>
                          {row.localization_confidence != null
                            ? `${Math.round(Number(row.localization_confidence) * 100)} %`
                            : "—"}
                        </td>
                        <td>{row.trigger_sensor_id || "—"}</td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="releves-empty">
                      Aucune localisation pour cette zone / ce capteur.
                      {filterZone ? (
                        <>
                          {" "}
                          Consultez la page{" "}
                          <Link to="/dashboard/capteurs">Capteurs pression</Link> ou injectez des mesures de demo.
                        </>
                      ) : (
                        " Choisissez une zone pour affiner la recherche."
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

        <div className="resultats-detail-column">
          {selectedResult ? (
            <article className="card resultats-detail-card">
              <h3>Detail du calcul</h3>
              <p className="map-caption">
                {formatDateTime(selectedResult.timestamp)} — {selectedResult.zone_name}
              </p>
              <dl className="resultats-metrics">
                <div>
                  <dt>Point de fuite estime (x)</dt>
                  <dd>
                    {Number(selectedResult.distance_m_from_upstream || 0).toFixed(0)} m depuis{" "}
                    {selectedResult.upstream_meter}
                    {selectedResult.segment_length_m != null
                      ? ` / ${Number(selectedResult.segment_length_m).toFixed(0)} m`
                      : ""}
                  </dd>
                </div>
                <div>
                  <dt>Rayon d&apos;incertitude (R)</dt>
                  <dd>
                    {selectedResult.leak_radius_m != null
                      ? `≈ ${Number(selectedResult.leak_radius_m).toFixed(0)} m`
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt>Position relative</dt>
                  <dd>
                    {selectedResult.position_ratio != null
                      ? `${(Number(selectedResult.position_ratio) * 100).toFixed(1)} % du troncon (amont → aval)`
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt>Capteur declencheur</dt>
                  <dd>{selectedResult.trigger_sensor_id || "—"}</dd>
                </div>
                <div>
                  <dt>Compteur source</dt>
                  <dd>{selectedResult.meter_source || "—"}</dd>
                </div>
              </dl>
              <LocalizationPhysicsDetail localization={selectedResult} segment={selectedResult.segment} />
            </article>
          ) : (
            <article className="card resultats-detail-card">
              <h3>Detail du calcul</h3>
              <p className="map-caption">Selectionnez une ligne dans le tableau pour afficher le detail.</p>
            </article>
          )}

          <LocalizationResultMap
            localization={selectedResult}
            zoneId={selectedResult?.zone_id}
            sensors={zoneSensorsForMap}
            meters={mapMeters}
            zones={mapZones}
            highlightSensorId={filterSensor || selectedResult?.trigger_sensor_id || ""}
          />
        </div>
      </section>
    </div>
  );
}
