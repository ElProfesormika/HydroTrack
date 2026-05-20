import { Link, useLocation } from "react-router-dom";

/** Cible de retour selon la page courante */
export function getPageBackTarget(pathname) {
  if (pathname === "/dashboard") return null;
  if (pathname.startsWith("/dashboard/")) return "/dashboard";
  if (pathname === "/releves") return "/dashboard";
  if (pathname === "/cartographie") return "/dashboard";
  if (pathname === "/admin/login") return "/dashboard";
  if (pathname === "/admin" || pathname === "/admin/") return "/dashboard";
  if (pathname.startsWith("/admin/")) return "/admin";
  return "/dashboard";
}

export function PageBackButton({ to, label = "Retour" }) {
  const { pathname } = useLocation();
  const target = to ?? getPageBackTarget(pathname);
  if (!target) return null;

  return (
    <Link to={target} className="page-back-btn" aria-label={label} title={label}>
      <span className="page-back-btn__icon" aria-hidden>
        ←
      </span>
      <span className="page-back-btn__label">{label}</span>
    </Link>
  );
}
