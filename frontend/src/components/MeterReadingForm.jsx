import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { hydroApi } from "../services/api";
import { wasDeleteCancelled } from "../utils/confirmDelete";

function toISOFromLocalDatetime(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString();
}

function formatDisplayDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function MeterReadingForm({ onSaved }) {
  const [meters, setMeters] = useState([]);
  const [meterId, setMeterId] = useState("");
  const [volume, setVolume] = useState("");
  const [readingAt, setReadingAt] = useState("");
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [recentReadings, setRecentReadings] = useState([]);

  const loadRecent = useCallback(async (mid) => {
    if (!mid) {
      setRecentReadings([]);
      return;
    }
    try {
      const res = await hydroApi.getMeterReadings(5, mid);
      setRecentReadings(res.items || []);
    } catch {
      setRecentReadings([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    hydroApi
      .getMapMeters()
      .then((res) => {
        if (cancelled) return;
        const items = res.items || [];
        setMeters(items);
        if (items.length) {
          setMeterId((prev) => prev || items[0].meter_id);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    loadRecent(meterId);
  }, [meterId, loadRecent]);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setStatus("");
    const ts = readingAt ? toISOFromLocalDatetime(readingAt) : new Date().toISOString();
    const vol = Number(volume);
    if (!meterId) {
      setStatus("Choisissez un compteur.");
      setSubmitting(false);
      return;
    }
    if (Number.isNaN(vol) || vol < 0) {
      setStatus("L'index compteur doit etre un nombre positif (m³).");
      setSubmitting(false);
      return;
    }
    try {
      const result = await hydroApi.createMeterReading({
        timestamp: ts,
        meter_id: meterId,
        volume: vol,
      });
      const ml = result.ml || {};
      const flow = result.reading?.flow_rate;
      setStatus(
        `Releve enregistre — index ${vol.toFixed(2)} m³` +
          (flow != null ? ` · debit calcule ${Number(flow).toFixed(2)} m³/h` : "") +
          ` · score ML ${ml.anomaly_score ?? "?"} · fuite ~${Math.round((ml.leak_probability ?? 0) * 100)}%`
      );
      setVolume("");
      await loadRecent(meterId);
      if (typeof onSaved === "function") onSaved();
    } catch (err) {
      setStatus(err.message || "Erreur lors de l'enregistrement.");
    }
    setSubmitting(false);
  }

  async function handleDeleteReading(item) {
    const label = `#${item.id} — ${item.meter_id} (${formatDisplayDate(item.timestamp)})`;
    const res = await hydroApi.deleteMeterReading(item.id, label);
    if (wasDeleteCancelled(res)) return;
    setStatus(`Releve #${item.id} supprime.`);
    await loadRecent(meterId);
    if (typeof onSaved === "function") onSaved();
  }

  return (
    <section className="card meter-reading-card">
      <h3>Nouveau releve compteur</h3>
      <p className="map-caption">
        Saisir l&apos;index affiche sur le compteur (m³) a la date du releve. Le debit est calcule automatiquement.
      </p>
      <form className="meter-reading-form" onSubmit={handleSubmit}>
        <label>
          Compteur
          <select value={meterId} onChange={(e) => setMeterId(e.target.value)}>
            {(meters || []).map((m) => (
              <option key={m.meter_id} value={m.meter_id}>
                {m.name || m.meter_id} ({m.meter_id})
              </option>
            ))}
          </select>
        </label>
        <label>
          Date / heure
          <input
            type="datetime-local"
            value={readingAt}
            onChange={(e) => setReadingAt(e.target.value)}
            placeholder="Laisser vide pour maintenant"
          />
        </label>
        <label>
          Index compteur (m³)
          <input
            type="number"
            min={0}
            step={0.01}
            value={volume}
            onChange={(e) => setVolume(e.target.value)}
            placeholder="Lecture affichee sur le compteur"
            required
          />
        </label>
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? "Envoi..." : "Enregistrer le releve"}
        </button>
      </form>
      {status ? <p className="meter-reading-status">{status}</p> : null}

      {recentReadings.length > 0 ? (
        <div className="meter-reading-recent">
          <h4>Derniers releves de ce compteur</h4>
          <ul className="meter-reading-recent-list">
            {recentReadings.map((item) => (
              <li key={item.id}>
                <span>
                  {formatDisplayDate(item.timestamp)} — {Number(item.volume || 0).toFixed(2)} m³
                </span>
                <button type="button" className="btn-link btn-link-danger" onClick={() => handleDeleteReading(item)}>
                  Supprimer
                </button>
              </li>
            ))}
          </ul>
          <Link to="/releves" className="map-caption">
            Voir tous les releves
          </Link>
        </div>
      ) : null}
    </section>
  );
}
