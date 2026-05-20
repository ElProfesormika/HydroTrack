import { DashboardHeader } from "../components/DashboardHeader";
import { MapPanel } from "../components/MapPanel";
import { MeterMapPanel } from "../components/MeterMapPanel";
import { useRealtimeDashboard } from "../hooks/useRealtimeDashboard";

export function MapPage() {
  const { mapZones, mapAlerts, mapMeters, mapSensors, anomalies } = useRealtimeDashboard();

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
          title="Carte capteurs & zones"
          caption="Reseau ~10 km : 33 zones capteurs (~300 m). Couleur = niveau d'attention. Halo = zone de surveillance."
        />
        <MeterMapPanel
          meters={mapMeters}
          anomalies={anomalies}
          title="Carte des compteurs"
          caption="Survolez un point pour voir nom, etat et dates. Couleur = niveau de risque ML. Clic pour le suivi detaille."
        />
      </div>
    </div>
  );
}
