import { useId, useState } from "react";

function formatPa(value) {
  if (value == null) return "—";
  const n = Number(value);
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} GPa`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(0)} MPa`;
  return `${n.toExponential(2)} Pa`;
}

export function LeakPhysicsPanel({ reference, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  if (!reference) return null;

  const { formulas, interpretation, materials, bulk_modulus_water_pa, fluid_density_kg_m3, water_temp_c } =
    reference;

  return (
    <article className="card leak-physics-panel catalog-fold">
      <button
        type="button"
        className="catalog-fold-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="catalog-fold-title">Modele physique — ondes de pression transitoires</span>
        <span className="catalog-fold-chevron" aria-hidden>
          {open ? "▾" : "▸"}
        </span>
      </button>
      <p className="map-caption catalog-fold-hint">
        Formules c, Δt, impedances — cliquer pour derouler le detail
      </p>
      <div
        id={panelId}
        className={`catalog-fold-body ${open ? "catalog-fold-body--open" : ""}`}
        style={open ? { maxHeight: 560 } : undefined}
        hidden={!open}
      >
        <div className="leak-physics-panel__inner">
          <blockquote className="leak-physics-quote">{interpretation}</blockquote>

          <div className="leak-physics-formulas">
            <div className="leak-physics-formula">
              <span className="leak-physics-formula-label">Vitesse d&apos;onde</span>
              <code>{formulas?.wave_speed}</code>
            </div>
            <div className="leak-physics-formula">
              <span className="leak-physics-formula-label">Point de fuite</span>
              <code>{formulas?.leak_position}</code>
            </div>
            <div className="leak-physics-formula">
              <span className="leak-physics-formula-label">Rayon zone estimee (R)</span>
              <code>{formulas?.leak_zone_radius}</code>
            </div>
            <div className="leak-physics-formula">
              <span className="leak-physics-formula-label">Impedance fluide</span>
              <code>{formulas?.fluid_impedance}</code>
            </div>
            <div className="leak-physics-formula">
              <span className="leak-physics-formula-label">Impedance paroi</span>
              <code>{formulas?.wall_impedance}</code>
            </div>
          </div>

          <dl className="leak-physics-constants">
            <div>
              <dt>K (eau, {water_temp_c} °C)</dt>
              <dd>{formatPa(bulk_modulus_water_pa)}</dd>
            </div>
            <div>
              <dt>ρ eau</dt>
              <dd>{fluid_density_kg_m3} kg/m³</dd>
            </div>
          </dl>

          <table className="leak-physics-table">
            <caption>Module de Young E — materiaux de tuyau (normes)</caption>
            <thead>
              <tr>
                <th>Materiau</th>
                <th>E</th>
                <th>ρ paroi</th>
              </tr>
            </thead>
            <tbody>
              {(materials || []).map((m) => (
                <tr key={m.id}>
                  <td>{m.label}</td>
                  <td>{formatPa(m.young_modulus_pa)}</td>
                  <td>{m.density_kg_m3} kg/m³</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </article>
  );
}

export function LocalizationPhysicsDetail({ localization, segment }) {
  if (!localization?.confirmed && !localization?.distance_m_from_upstream) return null;

  const wave = localization?.wave_speed_m_s ?? segment?.wave_speed_m_s;
  const dt = localization?.delta_t_s;
  const dtMethod = localization?.delta_t_method;
  const material = segment?.pipe_material_label || localization?.pipe_material || "acier";
  const radius = localization?.leak_radius_m;

  return (
    <div className="zone-localization zone-localization--physics">
      <strong>Localisation par onde transitoire</strong>
      <p>
        {Number(localization.distance_m_from_upstream || 0).toFixed(0)} m depuis {localization.upstream_meter}
        <br />
        Confiance : {Math.round(Number(localization.localization_confidence || 0) * 100)} %
        {radius != null ? (
          <>
            <br />
            Zone estimee : R ≈ {Number(radius).toFixed(0)} m (tres reduite)
          </>
        ) : null}
      </p>
      <ul className="zone-localization-meta">
        {wave != null ? (
          <li>
            c = <strong>{Number(wave).toFixed(0)} m/s</strong> ({material})
          </li>
        ) : null}
        {dt != null ? (
          <li>
            Δt = <strong>{(Number(dt) * 1000).toFixed(1)} ms</strong>
            {dtMethod ? ` (${dtMethod})` : null}
          </li>
        ) : null}
        {localization.transient_score != null ? (
          <li>Signature transitoire : {(Number(localization.transient_score) * 100).toFixed(0)} %</li>
        ) : null}
        {localization.sensor_correlation != null ? (
          <li>Correlation capteurs : {(Number(localization.sensor_correlation) * 100).toFixed(0)} %</li>
        ) : null}
      </ul>
      <p className="map-caption">
        x = (L + c·Δt) / 2 — L = longueur troncon entre capteurs
        {radius != null ? (
          <>
            {" "}
            · R ≈ {Number(radius).toFixed(0)} m : zone tres reduite autour de x (incertitude, pas etendue
            reelle)
          </>
        ) : null}
      </p>
    </div>
  );
}
