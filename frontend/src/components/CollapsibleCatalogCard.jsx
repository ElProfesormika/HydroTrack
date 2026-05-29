import { useId, useState } from "react";

/**
 * Carte catalogue repliable (compteurs / capteurs) pour limiter la hauteur en synthese.
 */
export function CollapsibleCatalogCard({
  title,
  count = 0,
  hint,
  defaultOpen = false,
  maxBodyHeight = 280,
  children,
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <article className="card insight-card catalog-fold">
      <button
        type="button"
        className="catalog-fold-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="catalog-fold-title">
          {title}
          {count > 0 ? <span className="catalog-fold-count">({count})</span> : null}
        </span>
        <span className="catalog-fold-chevron" aria-hidden>
          {open ? "▾" : "▸"}
        </span>
      </button>
      {hint ? <p className="map-caption catalog-fold-hint">{hint}</p> : null}
      <div
        id={panelId}
        className={`catalog-fold-body ${open ? "catalog-fold-body--open" : ""}`}
        style={open && maxBodyHeight ? { maxHeight: maxBodyHeight } : undefined}
        hidden={!open}
      >
        <div className="insight-card-content">{children}</div>
      </div>
    </article>
  );
}
