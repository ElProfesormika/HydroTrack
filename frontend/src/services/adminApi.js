import {
  inferDeleteConfirm,
  requireDeleteConfirmation,
  requireDeleteConfirmationForPath,
} from "../utils/confirmDelete";

const API_BASE = (import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");
const KEY_STORAGE = "hydrotrack_admin_key";

export function getAdminKey() {
  return sessionStorage.getItem(KEY_STORAGE) || "";
}

export function setAdminKey(key) {
  sessionStorage.setItem(KEY_STORAGE, String(key || "").trim());
}

export function clearAdminKey() {
  sessionStorage.removeItem(KEY_STORAGE);
}

/**
 * DELETE admin avec confirmation obligatoire.
 * Utiliser cette fonction ou adminApi.delete() pour tout nouvel enregistrement admin.
 */
export async function adminDelete(path, confirm) {
  const opts =
    confirm && (confirm.entityLabel || confirm.idOrName != null)
      ? { ...inferDeleteConfirm(path, confirm.hard), ...confirm }
      : inferDeleteConfirm(path, confirm?.hard);
  if (!requireDeleteConfirmation(opts)) return null;
  return adminRequest(path, { method: "DELETE", _deleteConfirmed: true });
}

async function adminRequest(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();

  if (method === "DELETE" && !options._deleteConfirmed) {
    const overrides = options.deleteConfirm || {};
    if (!requireDeleteConfirmationForPath(path, overrides)) return null;
  }

  const { deleteConfirm: _dc, _deleteConfirmed: _dc2, ...fetchOptions } = options;
  const key = getAdminKey();
  const headers = {
    "Content-Type": "application/json",
    "X-Admin-Key": key,
    ...(fetchOptions.headers || {}),
  };
  const response = await fetch(`${API_BASE}${path}`, { ...fetchOptions, method, headers });
  if (response.status === 401) {
    clearAdminKey();
    throw new Error("Session admin expiree — reconnectez-vous");
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Erreur ${response.status}: ${text || path}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

export const adminApi = {
  login: async (username, password) => {
    const response = await fetch(`${API_BASE}/api/admin/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.detail || "Identifiant ou mot de passe incorrect");
    }
    const data = await response.json();
    setAdminKey(data.token);
    return data;
  },

  getOverview: () => adminRequest("/api/admin/overview"),
  getAudit: (limit = 30) => adminRequest(`/api/admin/audit?limit=${limit}`),
  reloadRegistry: () => adminRequest("/api/admin/registry/reload", { method: "POST" }),
  syncLeaks: () => adminRequest("/api/admin/leaks/sync-from-localizations", { method: "POST" }),

  listMeters: (includeInactive = true) =>
    adminRequest(`/api/admin/meters?include_inactive=${includeInactive}`),
  createMeter: (body) => adminRequest("/api/admin/meters", { method: "POST", body: JSON.stringify(body) }),
  updateMeter: (id, body) =>
    adminRequest(`/api/admin/meters/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteMeter: (id, hard = false) =>
    adminDelete(`/api/admin/meters/${encodeURIComponent(id)}?hard=${hard}`, {
      entityLabel: "le compteur",
      idOrName: id,
      hard,
    }),

  listZones: (includeInactive = true) =>
    adminRequest(`/api/admin/zones?include_inactive=${includeInactive}`),
  createZone: (body) => adminRequest("/api/admin/zones", { method: "POST", body: JSON.stringify(body) }),
  updateZone: (id, body) =>
    adminRequest(`/api/admin/zones/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteZone: (id, hard = false, displayName) =>
    adminDelete(`/api/admin/zones/${id}?hard=${hard}`, {
      entityLabel: "la zone",
      idOrName: displayName || String(id),
      hard,
    }),

  listSensors: (includeInactive = true) =>
    adminRequest(`/api/admin/sensors?include_inactive=${includeInactive}`),
  createSensor: (body) => adminRequest("/api/admin/sensors", { method: "POST", body: JSON.stringify(body) }),
  updateSensor: (id, body) =>
    adminRequest(`/api/admin/sensors/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteSensor: (id, hard = false) =>
    adminDelete(`/api/admin/sensors/${encodeURIComponent(id)}?hard=${hard}`, {
      entityLabel: "le capteur",
      idOrName: id,
      hard,
    }),

  listSegments: () => adminRequest("/api/admin/segments"),
  updateSegment: (id, body) =>
    adminRequest(`/api/admin/segments/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteSegment: (id, displayName) =>
    adminDelete(`/api/admin/segments/${encodeURIComponent(id)}`, {
      entityLabel: "le troncon",
      idOrName: displayName || id,
      hard: true,
    }),

  listAlerts: (limit = 100, status) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (status) params.set("status", status);
    return adminRequest(`/api/admin/alerts?${params}`);
  },
  updateAlert: (id, body) =>
    adminRequest(`/api/admin/alerts/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteAlert: (id) =>
    adminDelete(`/api/admin/alerts/${id}`, {
      entityLabel: "l'alerte",
      idOrName: `#${id}`,
      hard: true,
    }),

  listLeaks: (limit = 50, status) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (status) params.set("status", status);
    return adminRequest(`/api/admin/leaks?${params}`);
  },
  updateLeak: (id, body) =>
    adminRequest(`/api/admin/leaks/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteLeak: (id) =>
    adminDelete(`/api/admin/leaks/${id}`, {
      entityLabel: "l'incident de fuite",
      idOrName: `#${id}`,
      hard: true,
    }),

  /** Suppression generique — confirmation automatique (futurs enregistrements admin). */
  delete: (path, confirm) => adminDelete(path, confirm),
};
