import { useCallback, useEffect, useState } from "react";
import { adminApi } from "../../services/adminApi";
import { AdminPageHeader } from "../../components/AdminPageHeader";
import { AdminPlanPicker, pointsFromMeters, pointsFromZones } from "../../components/admin/AdminPlanPicker";
import { wasDeleteCancelled } from "../../utils/confirmDelete";

const EMPTY_ZONE = {
  zone_id: "",
  name: "",
  short_name: "",
  plan_x: "",
  plan_y: "",
  active: true,
};

export function AdminZonesPage() {
  const [zones, setZones] = useState([]);
  const [meters, setMeters] = useState([]);
  const [segments, setSegments] = useState([]);
  const [error, setError] = useState("");
  const [zoneForm, setZoneForm] = useState(EMPTY_ZONE);
  const [segEdit, setSegEdit] = useState(null);

  const load = useCallback(async () => {
    const [z, s, m] = await Promise.all([
      adminApi.listZones(true),
      adminApi.listSegments(),
      adminApi.listMeters(true),
    ]);
    setZones(z.items || []);
    setSegments(s.items || []);
    setMeters(m.items || []);
  }, []);

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  function setPlanCoords(x, y) {
    setZoneForm((f) => ({ ...f, plan_x: x, plan_y: y }));
  }

  async function saveZone(e) {
    e.preventDefault();
    if (zoneForm.plan_x === "" || zoneForm.plan_y === "") {
      setError("Cliquez sur le plan pour definir la position de la zone.");
      return;
    }
    try {
      setError("");
      await adminApi.createZone({
        zone_id: Number(zoneForm.zone_id),
        name: zoneForm.name,
        short_name: zoneForm.short_name,
        plan_x: Number(zoneForm.plan_x),
        plan_y: Number(zoneForm.plan_y),
        active: zoneForm.active,
      });
      setZoneForm(EMPTY_ZONE);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeZone(zoneId, hard = false) {
    const label = zones.find((z) => z.zone_id === zoneId)?.name || `zone ${zoneId}`;
    try {
      setError("");
      const res = await adminApi.deleteZone(zoneId, hard, label);
      if (wasDeleteCancelled(res)) return;
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveSegment(e) {
    e.preventDefault();
    if (!segEdit) return;
    try {
      await adminApi.updateSegment(segEdit.segment_id, {
        upstream_meter: segEdit.upstream_meter,
        downstream_meter: segEdit.downstream_meter,
        length_m: Number(segEdit.length_m),
        active: segEdit.active,
        notes: segEdit.notes,
      });
      setSegEdit(null);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="admin-page">
      <AdminPageHeader
        title="Zones & troncons"
        description="Placez la zone sur le plan capteurs (~300 m entre points), puis renseignez l'identifiant et le nom."
      />
      {error ? <p className="error-box">{error}</p> : null}

      <section className="card admin-form-card">
        <h3>Nouvelle zone</h3>
        <form onSubmit={saveZone} className="admin-form-with-map">
          <div className="admin-form-grid">
            <label>
              ID zone
              <input
                type="number"
                min={1}
                value={zoneForm.zone_id}
                onChange={(e) => setZoneForm({ ...zoneForm, zone_id: e.target.value })}
                required
              />
            </label>
            <label>
              Nom
              <input value={zoneForm.name} onChange={(e) => setZoneForm({ ...zoneForm, name: e.target.value })} required />
            </label>
            <label>
              Nom court
              <input
                value={zoneForm.short_name}
                onChange={(e) => setZoneForm({ ...zoneForm, short_name: e.target.value })}
              />
            </label>
            <div className="admin-form-actions admin-form-full">
              <button type="submit" className="btn-primary">
                Creer zone
              </button>
            </div>
          </div>
          <AdminPlanPicker
            variant="sensors"
            planX={zoneForm.plan_x}
            planY={zoneForm.plan_y}
            onChange={setPlanCoords}
            existingPoints={[...pointsFromZones(zones), ...pointsFromMeters(meters)]}
            title="Cliquez pour placer la zone"
          />
        </form>
      </section>

      <section className="card">
        <h3>Troncons reseau</h3>
        {segEdit ? (
          <form className="admin-form-grid admin-segment-edit" onSubmit={saveSegment}>
            <strong className="admin-form-full">Edition {segEdit.segment_id}</strong>
            <label>
              Compteur amont
              <input
                value={segEdit.upstream_meter}
                onChange={(e) => setSegEdit({ ...segEdit, upstream_meter: e.target.value })}
              />
            </label>
            <label>
              Compteur aval
              <input
                value={segEdit.downstream_meter}
                onChange={(e) => setSegEdit({ ...segEdit, downstream_meter: e.target.value })}
              />
            </label>
            <label>
              Longueur (m)
              <input
                type="number"
                value={segEdit.length_m}
                onChange={(e) => setSegEdit({ ...segEdit, length_m: e.target.value })}
              />
            </label>
            <div className="admin-form-actions admin-form-full">
              <button type="submit" className="btn-primary">
                Enregistrer troncon
              </button>
              <button type="button" className="btn-ghost" onClick={() => setSegEdit(null)}>
                Annuler
              </button>
            </div>
          </form>
        ) : null}
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Troncon</th>
                <th>Zone</th>
                <th>Amont → Aval</th>
                <th>Longueur m</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {segments.map((row) => (
                <tr key={row.segment_id}>
                  <td>
                    <code>{row.segment_id}</code>
                  </td>
                  <td>{row.zone_id}</td>
                  <td>
                    {row.upstream_meter} → {row.downstream_meter}
                  </td>
                  <td>{row.length_m}</td>
                  <td>
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      onClick={() => setSegEdit({ ...row, notes: row.notes || "" })}
                    >
                      Modifier
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h3>Zones ({zones.length})</h3>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Nom</th>
                <th>Plan</th>
                <th>Actif</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {zones.map((z) => (
                <tr key={z.zone_id}>
                  <td>{z.zone_id}</td>
                  <td>{z.name}</td>
                  <td>
                    {z.plan_x != null ? `${Number(z.plan_x).toFixed(0)}, ${Number(z.plan_y).toFixed(0)}` : "—"}
                  </td>
                  <td>{z.active ? "Oui" : "Non"}</td>
                  <td className="admin-row-actions">
                    <button type="button" className="btn-ghost btn-sm" onClick={() => removeZone(z.zone_id, false)}>
                      Desactiver
                    </button>
                    <button type="button" className="btn-danger btn-sm" onClick={() => removeZone(z.zone_id, true)}>
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
