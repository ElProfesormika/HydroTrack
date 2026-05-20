import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { DashboardHeader } from "../components/DashboardHeader";
import { hydroApi } from "../services/api";
import { wasDeleteCancelled } from "../utils/confirmDelete";

function toISOFromLocalDatetime(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString();
}

function toLocalDatetimeInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDisplayDate(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const EMPTY_FORM = {
  meterId: "",
  readingAt: "",
  volume: "",
  notes: "",
};

export function RelevesPage() {
  const [meters, setMeters] = useState([]);
  const [readings, setReadings] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [filterMeter, setFilterMeter] = useState("");

  const loadReadings = useCallback(async () => {
    const res = await hydroApi.getMeterReadings(10, filterMeter || undefined);
    setReadings(res.items || []);
  }, [filterMeter]);

  useEffect(() => {
    hydroApi
      .getMapMeters()
      .then((res) => {
        const items = res.items || [];
        setMeters(items);
        if (items.length && !form.meterId) {
          setForm((f) => ({ ...f, meterId: items[0].meter_id }));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadReadings().catch((err) => setError(err.message || "Impossible de charger l'historique"));
  }, [loadReadings]);

  function resetForm() {
    setEditingId(null);
    setForm({
      ...EMPTY_FORM,
      meterId: meters[0]?.meter_id || "",
    });
    setStatus("");
  }

  function startEdit(item) {
    setEditingId(item.id);
    setForm({
      meterId: item.meter_id,
      readingAt: toLocalDatetimeInput(item.timestamp),
      volume: String(item.volume ?? ""),
      notes: item.notes || "",
    });
    setStatus("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setStatus("");
    setError("");

    const vol = Number(form.volume);
    if (!form.meterId) {
      setError("Selectionnez un compteur.");
      setSubmitting(false);
      return;
    }
    if (Number.isNaN(vol) || vol < 0) {
      setError("L'index compteur doit etre un nombre positif (m³).");
      setSubmitting(false);
      return;
    }

    const payload = {
      timestamp: form.readingAt ? toISOFromLocalDatetime(form.readingAt) : new Date().toISOString(),
      meter_id: form.meterId,
      volume: vol,
      notes: form.notes,
    };

    try {
      if (editingId) {
        const result = await hydroApi.updateMeterReading(editingId, payload);
        const ml = result.ml || {};
        const flow = result.reading?.flow_rate;
        setStatus(
          `Releve #${editingId} modifie — index ${vol.toFixed(2)} m³` +
            (flow != null ? ` · debit calcule ${Number(flow).toFixed(2)} m³/h` : "") +
            ` · score ML ${ml.anomaly_score ?? "?"} · fuite ~${Math.round((ml.leak_probability ?? 0) * 100)}%`
        );
      } else {
        const result = await hydroApi.createMeterReading(payload);
        const ml = result.ml || {};
        const flow = result.reading?.flow_rate;
        setStatus(
          `Releve enregistre — index ${vol.toFixed(2)} m³` +
            (flow != null ? ` · debit calcule ${Number(flow).toFixed(2)} m³/h` : "") +
            ` · score ML ${ml.anomaly_score ?? "?"} · fuite ~${Math.round((ml.leak_probability ?? 0) * 100)}%`
        );
      }
      resetForm();
      await loadReadings();
    } catch (err) {
      setError(err.message || "Erreur lors de l'enregistrement.");
    }
    setSubmitting(false);
  }

  async function handleDelete(id, meterId) {
    setError("");
    try {
      const label = meterId ? `#${id} — ${meterId}` : `#${id}`;
      const res = await hydroApi.deleteMeterReading(id, label);
      if (wasDeleteCancelled(res)) return;
      setStatus(`Releve #${id} supprime.`);
      if (editingId === id) resetForm();
      await loadReadings();
    } catch (err) {
      setError(err.message || "Suppression impossible.");
    }
  }

  return (
    <div className="page">
      <DashboardHeader
        title="Releves compteurs"
        description="Saisissez l'index affiche sur le compteur (m³) a la date du releve. Le debit est calcule automatiquement par rapport au releve precedent."
        isConnected
        onlineLabel="Pret"
        offlineLabel="Hors ligne"
      />

      {error ? <p className="error-box">{error}</p> : null}
      {status ? <p className="meter-reading-status">{status}</p> : null}

      <section className="split-grid releves-layout">
        <article className="card releves-form-card">
          <h3>{editingId ? `Modifier le releve #${editingId}` : "Nouveau releve"}</h3>
          <p className="map-caption">
            Saisir uniquement la <strong>quantite relevee sur le compteur</strong> (index en m³), comme sur votre
            fichier CSV. HydroTrack calcule le debit : (index actuel − index precedent) / temps ecoule.
          </p>
          <form className="meter-reading-form" onSubmit={handleSubmit}>
            <label>
              Compteur
              <select
                value={form.meterId}
                onChange={(e) => setForm((f) => ({ ...f, meterId: e.target.value }))}
              >
                {meters.map((m) => (
                  <option key={m.meter_id} value={m.meter_id}>
                    {m.name || m.meter_id}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Date / heure du releve
              <input
                type="datetime-local"
                value={form.readingAt}
                onChange={(e) => setForm((f) => ({ ...f, readingAt: e.target.value }))}
              />
            </label>
            <label>
              Index compteur (m³)
              <input
                type="number"
                min={0}
                step={0.01}
                value={form.volume}
                onChange={(e) => setForm((f) => ({ ...f, volume: e.target.value }))}
                placeholder="Lecture affichee sur le compteur"
                required
              />
            </label>
            <label>
              Notes (optionnel)
              <input
                type="text"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Commentaire terrain, contexte..."
              />
            </label>
            <div className="releves-form-actions">
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? "Enregistrement..." : editingId ? "Enregistrer les modifications" : "Ajouter le releve"}
              </button>
              {editingId ? (
                <button type="button" className="btn-secondary" onClick={resetForm}>
                  Annuler
                </button>
              ) : null}
            </div>
          </form>
        </article>

        <article className="card releves-history-card">
          <div className="releves-history-header">
            <h3>Derniers releves (10 max)</h3>
            <label className="meter-select-label releves-filter">
              Filtrer
              <select value={filterMeter} onChange={(e) => setFilterMeter(e.target.value)}>
                <option value="">Tous les compteurs</option>
                {meters.map((m) => (
                  <option key={m.meter_id} value={m.meter_id}>
                    {m.name || m.meter_id}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="releves-table-wrap">
            <table className="releves-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Compteur</th>
                  <th>Index (m³)</th>
                  <th>Debit calc.</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {readings.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="releves-empty">
                      Aucun releve manuel pour le moment.
                    </td>
                  </tr>
                ) : (
                  readings.map((item) => (
                    <tr key={item.id} className={editingId === item.id ? "releves-row-active" : ""}>
                      <td>{formatDisplayDate(item.timestamp)}</td>
                      <td>
                        <strong>{item.meter_id}</strong>
                        {item.notes ? <small>{item.notes}</small> : null}
                      </td>
                      <td>{Number(item.volume || 0).toFixed(2)}</td>
                      <td>{Number(item.flow_rate || 0).toFixed(2)} m³/h</td>
                      <td>
                        <div className="releves-row-actions">
                          <button type="button" className="btn-link" onClick={() => startEdit(item)}>
                            Modifier
                          </button>
                          <button
                            type="button"
                            className="btn-link btn-link-danger"
                            onClick={() => handleDelete(item.id, item.meter_id)}
                          >
                            Supprimer
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <p className="map-caption">
            Consultez aussi le <Link to="/dashboard/compteurs">dashboard compteurs</Link> pour les courbes agregees.
          </p>
        </article>
      </section>
    </div>
  );
}
