import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { RealtimeDashboardProvider } from "./context/RealtimeDashboardContext";
import "./chartSetup";
import "./styles/global.css";
import "./styles/admin.css";
import "leaflet/dist/leaflet.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <RealtimeDashboardProvider>
        <App />
      </RealtimeDashboardProvider>
    </BrowserRouter>
  </React.StrictMode>
);
