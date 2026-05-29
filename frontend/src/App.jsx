import { Navigate, Route, Routes } from "react-router-dom";
import { AdminAuthProvider } from "./context/AdminAuthContext";
import { withAppLayout } from "./layout/withAppLayout";
import { AdminLayout } from "./layout/AdminLayout";
import { DashboardAlertesPage } from "./pages/DashboardAlertesPage";
import { DashboardCapteursPage } from "./pages/DashboardCapteursPage";
import { DashboardCompteursPage } from "./pages/DashboardCompteursPage";
import { DashboardDetectionPage } from "./pages/DashboardDetectionPage";
import { DashboardPage } from "./pages/DashboardPage";
import { MapPage } from "./pages/MapPage";
import { RelevesPage } from "./pages/RelevesPage";
import { AdminAlertsPage } from "./pages/admin/AdminAlertsPage";
import { AdminDashboardPage } from "./pages/admin/AdminDashboardPage";
import { AdminLeaksPage } from "./pages/admin/AdminLeaksPage";
import { AdminLoginPage } from "./pages/admin/AdminLoginPage";
import { AdminMetersPage } from "./pages/admin/AdminMetersPage";
import { AdminSensorsPage } from "./pages/admin/AdminSensorsPage";
import { AdminZonesPage } from "./pages/admin/AdminZonesPage";

const Dashboard = withAppLayout(DashboardPage);
const Compteurs = withAppLayout(DashboardCompteursPage);
const Releves = withAppLayout(RelevesPage);
const Capteurs = withAppLayout(DashboardCapteursPage);
const Alertes = withAppLayout(DashboardAlertesPage);
const Detection = withAppLayout(DashboardDetectionPage);
const Cartographie = withAppLayout(MapPage);

export default function App() {
  return (
    <AdminAuthProvider>
      <Routes>
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboardPage />} />
          <Route path="compteurs" element={<AdminMetersPage />} />
          <Route path="capteurs" element={<AdminSensorsPage />} />
          <Route path="zones" element={<AdminZonesPage />} />
          <Route path="alertes" element={<AdminAlertsPage />} />
          <Route path="fuites" element={<AdminLeaksPage />} />
        </Route>

        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/dashboard/compteurs" element={<Compteurs />} />
        <Route path="/releves" element={<Releves />} />
        <Route path="/dashboard/capteurs" element={<Capteurs />} />
        <Route path="/dashboard/alertes" element={<Alertes />} />
        <Route path="/dashboard/detection" element={<Detection />} />
        <Route path="/cartographie" element={<Cartographie />} />

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AdminAuthProvider>
  );
}
