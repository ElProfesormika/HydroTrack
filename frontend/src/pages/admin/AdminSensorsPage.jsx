import { useCallback, useEffect, useState } from "react";
import { adminApi } from "../../services/adminApi";
import { AdminPageHeader } from "../../components/AdminPageHeader";
import { AdminPlanPicker, combinedSensorMapPoints } from "../../components/admin/AdminPlanPicker";
import { wasDeleteCancelled } from "../../utils/confirmDelete";

const EMPTY = {
  sensor_id: "",
  zone_id: 1,
  segment_id: "",
  role: "upstream",
  name: "",
  plan_x: "",
  plan_y: "",
  active: true,
  notes: "",
};

export function AdminSensorsPage() {
  const [items, setItems] = useState([]);
  const [zones, setZones] = useState([]);
  const [meters, setMeters] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [s, z, m] = await Promise.all([
      adminApi.listSensors(true),
      adminApi.listZones(true),
      adminApi.listMeters(true),
    ]);
    setItems(s.items || []);
    setZones(z.items || []);
    setMeters(m.items || []);
  }, []);

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
  }

  function openEdit(row) {
    setEditing(row.sensor_id);
    setForm({
      sensor_id: row.sensor_id,
      zone_id: row.zone_id,
      segment_id: row.segment_id || "",
      role: row.role || "upstream",
      name: row.name || "",
      plan_x: row.plan_x ?? "",
      plan_y: row.plan_y ?? "",
      active: Boolean(row.active),
      notes: row.notes || "",
    });
  }

  function setPlanCoords(x, y) {
    setForm((f) => ({ ...f, plan_x: x, plan_y: y }));
  }

  async function save(e) {
    e.preventDefault();
    setError("");
    if (form.plan_x === "" || form.plan_y === "") {
      setError("Cliquez sur le plan pour definir la position du capteur.");
      return;
    }
    try {
      const body = {
        zone_id: Number(form.zone_id),
        segment_id: form.segment_id || null,
        role: form.role,
        name: form.name,
        plan_x: Number(form.plan_x),
        plan_y: Number(form.plan_y),
        active: form.active,
        notes: form.notes,
      };
      if (editing) await adminApi.updateSensor(editing, body);
      else await adminApi.createSensor({ sensor_id: form.sensor_id, ...body });
      openCreate();
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(id, hard = false) {
    try {
      const res = await adminApi.deleteSensor(id, hard);
      if (wasDeleteCancelled(res)) return;
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  const mapPoints = combinedSensorMapPoints(zones, items, meters);

  return (
    <div className="admin-page">
      <AdminPageHeader
        title="Capteurs pression"
        description="Cliquez sur le plan pour placer le capteur, puis renseignez la zone et le nom."
      >
        <button type="button" className="btn-primary" onClick={openCreate}>
          + Nouveau capteur
        </button>
      </AdminPageHeader>
      {error ? <p className="error-box">{error}</p> : null}

      <section className="card admin-form-card">
        <h3>{editing ? `Modifier ${editing}` : "Nouveau capteur"}</h3>
        <form onSubmit={save} className="admin-form-with-map">
          <div className="admin-form-grid">
            {!editing ? (
              <label>
                ID capteur
                <input
                  value={form.sensor_id}
                  onChange={(e) => setForm({ ...form, sensor_id: e.target.value })}
                  required
                  placeholder="Ex. S_Z34_A"
                />
              </label>
            ) : null}
            <label>
              Zone
              <input
                type="number"
                min={1}
                value={form.zone_id}
                onChange={(e) => setForm({ ...form, zone_id: e.target.value })}
              />
            </label>
            <label>
              Role
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="upstream">Amont</option>
                <option value="downstream">Aval</option>
              </select>
            </label>
            <label>
              Nom
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </label>
            <label className="admin-checkbox">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
              />
              Actif
            </label>
            <label className="admin-form-full">
              Notes
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
            </label>
            <div className="admin-form-actions admin-form-full">
              <button type="submit" className="btn-primary">
                {editing ? "Enregistrer" : "Creer"}
              </button>
              {editing ? (
                <button type="button" className="btn-ghost" onClick={openCreate}>
                  Annuler
                </button>
              ) : null}
            </div>
          </div>
          <AdminPlanPicker
            variant="sensors"
            planX={form.plan_x}
            planY={form.plan_y}
            onChange={setPlanCoords}
            existingPoints={mapPoints}
            excludeId={editing}
            title="Cliquez pour placer le capteur"
          />
        </form>
      </section>

      <section className="card">
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Zone</th>
                <th>Plan</th>
                <th>Role</th>
                <th>Actif</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.sensor_id}>
                  <td>
                    <code>{row.sensor_id}</code>
                  </td>
                  <td>{row.zone_id}</td>
                  <td>
                    {row.plan_x != null ? `${Number(row.plan_x).toFixed(0)}, ${Number(row.plan_y).toFixed(0)}` : "—"}
                  </td>
                  <td>{row.role}</td>
                  <td>{row.active ? "Oui" : "Non"}</td>
                  <td className="admin-row-actions">
                    <button type="button" className="btn-ghost btn-sm" onClick={() => openEdit(row)}>
                      Modifier
                    </button>
                    <button type="button" className="btn-ghost btn-sm" onClick={() => remove(row.sensor_id, false)}>
                      Desactiver
                    </button>
                    <button type="button" className="btn-danger btn-sm" onClick={() => remove(row.sensor_id, true)}>
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
