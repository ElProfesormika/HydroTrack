import { NavLink, Outlet, Navigate } from "react-router-dom";
import { AppBrandLogos } from "../components/AppBrandLogos";
import { useAdminAuth } from "../context/AdminAuthContext";

const NAV = [
  { to: "/admin", end: true, label: "Vue d'ensemble" },
  { to: "/admin/compteurs", label: "Compteurs" },
  { to: "/admin/capteurs", label: "Capteurs" },
  { to: "/admin/zones", label: "Zones & troncons" },
  { to: "/admin/alertes", label: "Alertes" },
  { to: "/admin/fuites", label: "Incidents fuite" },
];

export function AdminLayout() {
  const { isAuthenticated, logout } = useAdminAuth();

  if (!isAuthenticated) {
    return <Navigate to="/admin/login" replace />;
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <AppBrandLogos compact />
          <span className="admin-brand-sub">Administration</span>
        </div>
        <nav>
          {NAV.map(({ to, end, label }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? "active" : "")}>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="admin-sidebar-footer">
          <NavLink to="/dashboard">← Retour application</NavLink>
          <button type="button" className="btn-ghost" onClick={logout}>
            Deconnexion
          </button>
        </div>
      </aside>
      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  );
}
