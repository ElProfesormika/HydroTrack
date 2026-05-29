import { DashboardHeader } from "../components/DashboardHeader";
import { MapPanel } from "../components/MapPanel";
import { MeterMapPanel } from "../components/MeterMapPanel";
import { useRealtimeDashboard } from "../hooks/useRealtimeDashboard";

export function MapPage() {
  const { mapZones, mapAlerts, mapMeters, mapSensors, anomalies, alerts, leakLocalizations } =
    useRealtimeDashboard();

  return (
    <div className="page">
      <DashboardHeader
        title="Cartographie"
        description="Vue simplifiee du plan principal : emplacements capteurs et compteurs recales sur le site reel."
      />

      <div className="maps-two">
        <MapPanel
          zones={mapZones}
          sensors={mapSensors}
          alerts={mapAlerts}
          leakLocalizations={leakLocalizations}
          meters={mapMeters}
          title="Carte capteurs & zones"
          caption="Troncons colores = etat zone. Point rouge + trait epais = fuite localisee (x) et zone estimee R."
        />
        <MeterMapPanel
          meters={mapMeters}
          anomalies={anomalies}
          alerts={alerts}
          title="Carte des compteurs"
          caption="Couleur et % = probabilite de fuite ML renvoyee par l'API (derniere anomalie ou alerte)."
        />
      </div>
    </div>
  );
}
