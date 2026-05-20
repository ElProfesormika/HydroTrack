import L from "leaflet";
import { useEffect } from "react";
import { useMap } from "react-leaflet";

/**
 * Ajuste le plan sur le viewport Leaflet.
 * - contain : plan entier visible (admin, selection)
 * - cover : plan agrandi pour remplir tout le cadre (cartes reseau)
 */
export function fitPlanBounds(map, bounds, mode = "contain") {
  map.invalidateSize(false);
  const latLngBounds = L.latLngBounds(bounds);

  if (mode === "contain") {
    map.fitBounds(latLngBounds, { animate: false, padding: [0, 0] });
    return;
  }

  const zoom = map.getBoundsZoom(latLngBounds, false, [0, 0]);
  const nw = latLngBounds.getNorthWest();
  const se = latLngBounds.getSouthEast();
  const nwPt = map.project(nw, zoom);
  const sePt = map.project(se, zoom);
  const boundsW = Math.abs(sePt.x - nwPt.x) || 1;
  const boundsH = Math.abs(sePt.y - nwPt.y) || 1;
  const { x: w, y: h } = map.getSize();
  const scale = Math.max(w / boundsW, h / boundsH);
  const zoomCover = zoom + Math.log2(scale);
  map.setView(latLngBounds.getCenter(), zoomCover, { animate: false });
}

export function PlanMapFitBounds({ bounds, mode = "contain" }) {
  const map = useMap();

  useEffect(() => {
    const fit = () => fitPlanBounds(map, bounds, mode);

    fit();
    const pane = map.getContainer()?.closest(".map-panel-fill");
    const ro = pane ? new ResizeObserver(() => fit()) : null;
    if (pane && ro) ro.observe(pane);
    window.addEventListener("resize", fit);
    map.on("load", fit);
    map.on("layeradd", fit);

    return () => {
      window.removeEventListener("resize", fit);
      if (ro) ro.disconnect();
      map.off("load", fit);
      map.off("layeradd", fit);
    };
  }, [map, bounds, mode]);

  return null;
}
