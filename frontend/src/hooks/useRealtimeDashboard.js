import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { hydroApi } from "../services/api";

function wsEventsUrl() {
  const envUrl = import.meta.env.VITE_WS_URL;
  if (envUrl) return envUrl;
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws/events`;
}

export function useRealtimeDashboard() {
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

  const loadAll = useCallback(async () => {
    try {
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
      ] = await Promise.all([
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
      const meterCandidates = Array.from(
        new Set([
          ...(meters?.items || []).map((m) => m.meter_id).filter(Boolean),
          ...(meterMulti?.series || []).map((s) => s.meter_id).filter(Boolean),
          ...(anomalies?.items || []).map((a) => a.meter_id).filter(Boolean),
        ])
      );
      const currentMeterId = selectedMeterIdRef.current;
      const resolvedMeterId =
        currentMeterId && meterCandidates.includes(currentMeterId)
          ? currentMeterId
          : meterCandidates[0] || "";
      const selectedMeterProfile = resolvedMeterId ? await hydroApi.getMeterProfile(resolvedMeterId) : null;
      if (resolvedMeterId !== currentMeterId) {
        selectedMeterIdRef.current = resolvedMeterId;
        setSelectedMeterId(resolvedMeterId);
      }

      setData({
        overview,
        timeseries: series.items || [],
        meterFlowSeries: meterFlow.items || [],
        meterFlowPerMeter: {
          buckets: meterMulti?.buckets ?? [],
          series: meterMulti?.series ?? [],
        },
        pressureSeries: pressure.items || [],
        alertStats,
        alerts: alerts.items || [],
        anomalies: anomalies.items || [],
        sensorsCatalog: sensorsCatalog.items || [],
        zoneSensors: zoneSensors.items || [],
        leakLocalizations: leakLocalizations.items || [],
        mapZones: zones.items || [],
        mapAlerts: mapAlerts.items || [],
        mapMeters: meters.items || [],
        mapSensors: mapSensors.items || [],
        selectedMeterProfile,
      });
      setError("");
    } catch (err) {
      setError(err.message || "Echec de chargement");
    }
  }, []);

  const setSelectedMeter = useCallback(
    async (meterId) => {
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
    },
    [setData]
  );

  useEffect(() => {
    loadAll();
    const interval = setInterval(loadAll, 10000);
    return () => clearInterval(interval);
  }, [loadAll]);

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

  return useMemo(
    () => ({ ...data, selectedMeterId, isConnected, error, refresh: loadAll, setSelectedMeter }),
    [data, selectedMeterId, isConnected, error, loadAll, setSelectedMeter]
  );
}
