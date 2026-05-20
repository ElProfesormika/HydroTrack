import { useCallback, useEffect, useState } from "react";
import { AdminPageHeader } from "../../components/AdminPageHeader";
import { adminApi } from "../../services/adminApi";
import { confirmAction, wasDeleteCancelled } from "../../utils/confirmDelete";

const STATUSES = ["active", "acknowledged", "resolved", "dismissed"];

export function AdminAlertsPage() {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await adminApi.listAlerts(150, filter || undefined);
    setItems(res.items || []);
  }, [filter]);

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  async function updateStatus(id, status) {
    const labels = {
      resolved: `Marquer l'alerte #${id} comme resolue ?`,
      dismissed: `Ignorer l'alerte #${id} ? Elle ne sera plus affichee comme active.`,
      acknowledged: `Acquitter l'alerte #${id} ?`,
    };
    if (labels[status] && !confirmAction(labels[status])) return;
    try {
      await adminApi.updateAlert(id, { status, admin_notes: `Statut admin: ${status}` });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(id) {
    try {
      const res = await adminApi.deleteAlert(id);
      if (wasDeleteCancelled(res)) return;
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="admin-page">
      <AdminPageHeader title="Alertes" description="Acquitter, resoudre ou supprimer les alertes du systeme.">
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className="admin-select">
          <option value="">Tous statuts</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </AdminPageHeader>
      {error ? <p className="error-box">{error}</p> : null}

      <section className="card">
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Date</th>
                <th>Source</th>
                <th>Categorie</th>
                <th>Gravite</th>
                <th>Statut</th>
                <th>Message</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id}>
                  <td>{row.id}</td>
                  <td>{new Date(row.timestamp).toLocaleString("fr-FR")}</td>
                  <td>
                    <code>{row.source_id}</code>
                  </td>
                  <td>{row.category}</td>
                  <td>{row.severity}</td>
                  <td>
                    <span className={`admin-status admin-status--${row.status || "active"}`}>{row.status || "active"}</span>
                  </td>
                  <td className="admin-cell-message">{row.message}</td>
                  <td className="admin-row-actions">
                    <button type="button" className="btn-ghost btn-sm" onClick={() => updateStatus(row.id, "resolved")}>
                      Resolu
                    </button>
                    <button type="button" className="btn-ghost btn-sm" onClick={() => updateStatus(row.id, "dismissed")}>
                      Ignorer
                    </button>
                    <button type="button" className="btn-danger btn-sm" onClick={() => remove(row.id)}>
                      Suppr.
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
