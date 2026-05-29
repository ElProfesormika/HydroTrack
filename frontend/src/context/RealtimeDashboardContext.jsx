import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { hydroApi } from "../services/api";
import { readMeterFromSearch } from "../utils/meterRoute";

const RealtimeDashboardContext = createContext(null);

function wsEventsUrl() {
  const envUrl = import.meta.env.VITE_WS_URL;
  if (envUrl) return envUrl;
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws/events`;
}

function resolvePreferredMeterId(meterCandidates, currentMeterId) {
  const urlMeter = readMeterFromSearch(window.location.search);
  if (window.location.pathname === "/dashboard/compteurs" && urlMeter && meterCandidates.includes(urlMeter)) {
    return urlMeter;
  }
  if (currentMeterId && meterCandidates.includes(currentMeterId)) return currentMeterId;
  return meterCandidates[0] || "";
}

export function RealtimeDashboardProvider({ children }) {
  const location = useLocation();
  const [data, setData] = useState({
    overview: null,
    timeseries: [],
    meterFlowSeries: [],
    meterFlowPerMeter: { buckets: [], series: [] },
    pressureSeries: [],
    alertStats: null,
    alerts: [],
    anomalies: [],
    mapZones: [],
    mapAlerts: [],
    mapMeters: [],
    mapSensors: [],
    sensorsCatalog: [],
    zoneSensors: [],
    leakLocalizations: [],
    selectedMeterProfile: null,
  });
  const [selectedMeterId, setSelectedMeterId] = useState("");
  const selectedMeterIdRef = useRef("");
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const loadAll = useCallback(async () => {
    try {
      const settled = await Promise.allSettled([
        hydroApi.getOverview(),
        hydroApi.getTimeSeries(),
        hydroApi.getMeterFlowSeries(),
        hydroApi.getMeterFlowPerMeter(),
        hydroApi.getPressureSeries(),
        hydroApi.getAlertStats(),
        hydroApi.getAlerts(),
        hydroApi.getAnomalies(),
        hydroApi.getSensorsCatalog(),
        hydroApi.getZoneSensors(),
        hydroApi.getLeakLocalizations(30),
        hydroApi.getMapZones(),
        hydroApi.getMapAlerts(),
        hydroApi.getMapMeters(),
        hydroApi.getMapSensors(),
      ]);
      const [
        overview,
        series,
        meterFlow,
        meterMulti,
        pressure,
        alertStats,
        alerts,
        anomalies,
        sensorsCatalog,
        zoneSensors,
        leakLocalizations,
        zones,
        mapAlerts,
        meters,
        mapSensors,
      ] = settled.map((r, i) => {
        if (r.status === "fulfilled") return r.value;
        console.warn("[HydroTrack] API partielle en echec:", i, r.reason);
        return null;
      });
      const failed = settled.filter((r) => r.status === "rejected");
      const meterCandidates = Array.from(
        new Set([
          ...(meters?.items || []).map((m) => m.meter_id).filter(Boolean),
          ...(meterMulti?.series || []).map((s) => s.meter_id).filter(Boolean),
          ...(anomalies?.items || []).map((a) => a.meter_id).filter(Boolean),
        ])
      );
      const currentMeterId = selectedMeterIdRef.current;
      const resolvedMeterId = resolvePreferredMeterId(meterCandidates, currentMeterId);
      const selectedMeterProfile = resolvedMeterId ? await hydroApi.getMeterProfile(resolvedMeterId) : null;
      if (resolvedMeterId !== currentMeterId) {
        selectedMeterIdRef.current = resolvedMeterId;
        setSelectedMeterId(resolvedMeterId);
      }

      setData({
        overview: overview ?? null,
        timeseries: series?.items || [],
        meterFlowSeries: meterFlow?.items || [],
        meterFlowPerMeter: {
          buckets: meterMulti?.buckets ?? [],
          series: meterMulti?.series ?? [],
        },
        pressureSeries: pressure?.items || [],
        alertStats: alertStats ?? null,
        alerts: alerts?.items || [],
        anomalies: anomalies?.items || [],
        sensorsCatalog: sensorsCatalog?.items || [],
        zoneSensors: zoneSensors?.items || [],
        leakLocalizations: leakLocalizations?.items || [],
        mapZones: zones?.items || [],
        mapAlerts: mapAlerts?.items || [],
        mapMeters: meters?.items || [],
        mapSensors: mapSensors?.items || [],
        selectedMeterProfile,
      });
      if (failed.length === settled.length) {
        setError(failed[0].reason?.message || "Echec de chargement — backend indisponible ?");
      } else if (failed.length > 0) {
        setError(
          `${failed.length} source(s) API indisponible(s). Affichage partiel. Demarrez le backend sur le port 8000.`
        );
      } else {
        setError("");
      }
    } catch (err) {
      setError(err.message || "Echec de chargement");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const setSelectedMeter = useCallback(async (meterId) => {
    try {
      const safeMeterId = String(meterId || "");
      const profile = safeMeterId ? await hydroApi.getMeterProfile(safeMeterId) : null;
      selectedMeterIdRef.current = safeMeterId;
      setSelectedMeterId(safeMeterId);
      setData((current) => ({
        ...current,
        selectedMeterProfile: profile,
      }));
    } catch (err) {
      setError(err.message || "Echec du chargement du compteur");
    }
  }, []);

  useEffect(() => {
    loadAll();
    const interval = setInterval(loadAll, 10000);
    return () => clearInterval(interval);
  }, [loadAll]);

  useEffect(() => {
    if (location.pathname !== "/dashboard/compteurs") return;
    const urlMeter = readMeterFromSearch(location.search);
    if (!urlMeter || urlMeter === selectedMeterIdRef.current) return;
    setSelectedMeter(urlMeter);
  }, [location.pathname, location.search, setSelectedMeter]);

  useEffect(() => {
    let ws;
    let reconnectTimer;

    const connect = () => {
      ws = new WebSocket(wsEventsUrl());
      ws.onopen = () => {
        setIsConnected(true);
        ws.send("subscribe");
      };
      ws.onclose = () => {
        setIsConnected(false);
        reconnectTimer = setTimeout(connect, 2200);
      };
      ws.onerror = () => setIsConnected(false);
      ws.onmessage = () => loadAll();
    };

    connect();
    return () => {
      clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, [loadAll]);

  const value = useMemo(
    () => ({
      ...data,
      selectedMeterId,
      isConnected,
      error,
      isLoading,
      refresh: loadAll,
      setSelectedMeter,
    }),
    [data, selectedMeterId, isConnected, error, isLoading, loadAll, setSelectedMeter]
  );

  return <RealtimeDashboardContext.Provider value={value}>{children}</RealtimeDashboardContext.Provider>;
}

const EMPTY_CTX = {
  overview: null,
  timeseries: [],
  meterFlowSeries: [],
  meterFlowPerMeter: { buckets: [], series: [] },
  pressureSeries: [],
  alertStats: null,
  alerts: [],
  anomalies: [],
  mapZones: [],
  mapAlerts: [],
  mapMeters: [],
  mapSensors: [],
  sensorsCatalog: [],
  zoneSensors: [],
  leakLocalizations: [],
  selectedMeterProfile: null,
  selectedMeterId: "",
  isConnected: false,
  error: "Provider dashboard non monte",
  isLoading: false,
  refresh: async () => {},
  setSelectedMeter: async () => {},
};

export function useRealtimeDashboard() {
  const ctx = useContext(RealtimeDashboardContext);
  return ctx ?? EMPTY_CTX;
}
