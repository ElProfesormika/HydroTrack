import { PageBackButton } from "./PageBackButton";

export function DashboardHeader({
  title,
  description,
  isConnected,
  onlineLabel = "Flux temps reel",
  offlineLabel = "Hors ligne",
  backTo,
}) {
  return (
    <header className="page-header page-header-with-back">
      <div className="page-header__lead">
        <PageBackButton to={backTo} />
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
      </div>
      {isConnected != null ? (
        <div className={`connection-pill ${isConnected ? "online" : "offline"}`}>
          {isConnected ? onlineLabel : offlineLabel}
        </div>
      ) : null}
    </header>
  );
}
