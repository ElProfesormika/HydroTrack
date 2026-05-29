import { NavLink } from "react-router-dom";
import { AppBrandLogos } from "../components/AppBrandLogos";

/** Shell avec sidebar ; le contenu de la page est passe en children (pas d'Outlet). */
export function AppLayout({ children }) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <AppBrandLogos />
          <p className="sidebar-tagline">Surveillance reseau eau — CNPE</p>
        </div>
        <nav>
          <div className="nav-section-label">Tableaux de bord</div>
          <NavLink to="/dashboard" end className={({ isActive }) => (isActive ? "active" : "")}>
            Synthese
          </NavLink>
          <NavLink to="/dashboard/compteurs" className={({ isActive }) => (isActive ? "active" : "")}>
            Compteurs
          </NavLink>
          <NavLink to="/releves" className={({ isActive }) => (isActive ? "active" : "")}>
            Releves
          </NavLink>
          <NavLink to="/dashboard/capteurs" className={({ isActive }) => (isActive ? "active" : "")}>
            Capteurs pression
          </NavLink>
          <NavLink to="/dashboard/alertes" className={({ isActive }) => (isActive ? "active" : "")}>
            Alertes
          </NavLink>
          <NavLink to="/dashboard/detection" className={({ isActive }) => (isActive ? "active" : "")}>
            Detection IA
          </NavLink>
          <div className="nav-section-label">Cartographie</div>
          <NavLink to="/cartographie" className={({ isActive }) => (isActive ? "active" : "")}>
            Cartes reseau
          </NavLink>
          <div className="nav-section-label">Administration</div>
          <NavLink to="/admin" className={({ isActive }) => `nav-admin-link ${isActive ? "active" : ""}`}>
            Panneau admin
          </NavLink>
        </nav>
      </aside>
      <main className="main-content">{children ?? null}</main>
    </div>
  );
}
