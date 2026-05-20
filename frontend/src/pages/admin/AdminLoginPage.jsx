import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { AppBrandLogos } from "../../components/AppBrandLogos";
import { PageBackButton } from "../../components/PageBackButton";
import { useAdminAuth } from "../../context/AdminAuthContext";

export function AdminLoginPage() {
  const { isAuthenticated, login } = useAdminAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (isAuthenticated) {
    return <Navigate to="/admin" replace />;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(username.trim(), password);
      navigate("/admin");
    } catch (err) {
      setError(err.message || "Identifiant ou mot de passe incorrect");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="admin-login-page">
      <div className="admin-login-top">
        <PageBackButton to="/dashboard" label="Retour" />
      </div>
      <form className="admin-login-card card" onSubmit={handleSubmit}>
        <AppBrandLogos className="admin-login-logos" />
        <h2 className="admin-login-subtitle">Administration</h2>
        <p className="map-caption">Acces complet : compteurs, capteurs, zones, alertes et incidents de fuite.</p>

        <label className="admin-field">
          Identifiant
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="admin"
            autoComplete="username"
            required
          />
        </label>

        <label className="admin-field">
          Mot de passe
          <div className="admin-password-wrap">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              className="admin-password-toggle"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
              title={showPassword ? "Masquer" : "Afficher"}
            >
              {showPassword ? "Masquer" : "Afficher"}
            </button>
          </div>
        </label>

        <p className="admin-login-hint">Compte dev : admin / hydrotrack-admin-dev</p>
        {error ? <p className="error-box">{error}</p> : null}
        <button type="submit" className="btn-primary admin-login-btn" disabled={loading}>
          {loading ? "Connexion..." : "Connexion"}
        </button>
        <a href="/dashboard" className="admin-back-link">
          Retour au tableau de bord
        </a>
      </form>
    </div>
  );
}
