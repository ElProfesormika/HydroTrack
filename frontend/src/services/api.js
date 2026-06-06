import { inferDeleteConfirm, requireDeleteConfirmation } from "../utils/confirmDelete";

/** Base API : vide en dev (proxy Vite) ou VITE_API_BASE en production */
const API_BASE = (import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");

function networkError(path, cause) {
  const hint =
    "Verifiez que le backend est demarre (port 8001 si 8000 occupe) : cd backend && source .venv/bin/activate && uvicorn app.main:app --reload --host 0.0.0.0 --port 8001";
  return new Error(`Connexion impossible vers ${path}. ${hint}`, { cause });
}

async function request(path) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`);
  } catch (err) {
    throw networkError(path, err);
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Erreur API ${response.status} sur ${path}${text ? ` : ${text}` : ""}`);
  }
  return response.json();
}

async function requestPost(path, body) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw networkError(path, err);
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    let detail = text;
    try {
      const json = JSON.parse(text);
      detail = json.detail || text;
    } catch {
      /* keep raw text */
    }
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return response.json();
}

async function requestPut(path, body) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw networkError(path, err);
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    let detail = text;
    try {
      const json = JSON.parse(text);
      detail = json.detail || text;
    } catch {
      /* keep raw text */
    }
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return response.json();
}

/**
 * DELETE avec confirmation obligatoire (y compris futurs enregistrements).
 * @param {string} path
 * @param {{ entityLabel?: string, idOrName?: string, hard?: boolean }} [confirm] — optionnel ; infere depuis path si absent
 */
async function requestDelete(path, confirm) {
  const opts =
    confirm && (confirm.entityLabel || confirm.idOrName != null)
      ? { ...inferDeleteConfirm(path, confirm.hard), ...confirm }
      : inferDeleteConfirm(path, confirm?.hard);
  if (!requireDeleteConfirmation(opts)) return null;

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, { method: "DELETE" });
  } catch (err) {
    throw networkError(path, err);
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Erreur API ${response.status} sur ${path} ${text}`.trim());
  }
  return response.json();
}

export const hydroApi = {
  getOverview: () => request("/api/dashboard/overview"),
  getTimeSeries: (bucketMinutes = 30, points = 24) =>
    request(`/api/dashboard/timeseries?bucket_minutes=${bucketMinutes}&points=${points}`),
  getMeterFlowSeries: (bucketMinutes = 60, points = 24) =>
    request(`/api/dashboard/meter-flow-series?bucket_minutes=${bucketMinutes}&points=${points}`),
  getMeterFlowPerMeter: (bucketMinutes = 60, points = 72) =>
    request(`/api/dashboard/meter-flow-per-meter?bucket_minutes=${bucketMinutes}&points=${points}`),
  getMeterProfile: (meterId, bucketMinutes = 30, points = 48, recentLimit = 12) =>
    request(
      `/api/dashboard/meter-profile/${encodeURIComponent(
        meterId
      )}?bucket_minutes=${bucketMinutes}&points=${points}&recent_limit=${recentLimit}`
    ),
  postMeterData: (payload) => requestPost("/api/meters/data", payload),
  getMeterReadings: (limit = 10, meterId) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (meterId) params.set("meter_id", meterId);
    return request(`/api/meter-readings?${params}`);
  },
  getMeterReading: (id) => request(`/api/meter-readings/${id}`),
  createMeterReading: (payload) => requestPost("/api/meter-readings", payload),
  updateMeterReading: (id, payload) => requestPut(`/api/meter-readings/${id}`, payload),
  deleteMeterReading: (id, displayName) =>
    requestDelete(`/api/meter-readings/${id}`, {
      entityLabel: "le releve",
      idOrName: displayName || `#${id}`,
      hard: true,
    }),
  /** Suppression generique — confirmation automatique (futurs enregistrements utilisateurs). */
  delete: (path, confirm) => requestDelete(path, confirm),
  getPressureSeries: (bucketMinutes = 60, points = 24) =>
    request(`/api/dashboard/pressure-series?bucket_minutes=${bucketMinutes}&points=${points}`),
  getAlertStats: () => request("/api/dashboard/alert-stats"),
  getSensorsCatalog: () => request("/api/dashboard/sensors-catalog"),
  getZoneSensors: () => request("/api/dashboard/zone-sensors"),
  getWavePhysics: () => request("/api/dashboard/wave-physics"),
  getNetworkTopology: () => request("/api/network/topology"),
  getLeakLocalizations: (limit = 20, confirmedOnly = false) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (confirmedOnly) params.set("confirmed_only", "true");
    return request(`/api/leaks/localizations?${params}`);
  },
  postPressureData: (payload) => requestPost("/api/sensors/pressure", payload),
  getAlerts: (limit = 15) => request(`/api/alerts?limit=${limit}`),
  getAnomalies: (limit = 15) => request(`/api/anomalies?limit=${limit}`),
  getMapZones: () => request("/api/map/zones"),
  getMapAlerts: (limit = 40) => request(`/api/map/alerts?limit=${limit}`),
  getMapMeters: () => request("/api/map/meters"),
  getMapSensors: () => request("/api/map/sensors"),
};

export { requestDelete };
