import { Component } from "react";

export class RouteErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[HydroTrack] Erreur page:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="page">
          <div className="error-box">
            <strong>Impossible d&apos;afficher cette page.</strong>
            <p>{this.state.error.message}</p>
            <p className="map-caption">Rechargez la page (Ctrl+Shift+R) ou revenez au tableau de bord.</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
