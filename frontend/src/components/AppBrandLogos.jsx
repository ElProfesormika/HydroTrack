const HYDRO_LOGO = "/logos/hydrotrack.png";
const EDF_LOGO = "/logos/edf.png";

export function AppBrandLogos({ compact = false, showTitle = true, className = "" }) {
  return (
    <div className={`app-brand-logos ${compact ? "app-brand-logos--compact" : ""} ${className}`.trim()}>
      <div className="app-brand-logos__images">
        <img src={HYDRO_LOGO} alt="" className="app-brand-logos__hydro" aria-hidden />
        <img src={EDF_LOGO} alt="EDF" className="app-brand-logos__edf" />
      </div>
      {showTitle ? <p className="app-brand-title">HydroTrack</p> : null}
    </div>
  );
}
