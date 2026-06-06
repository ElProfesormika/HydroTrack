import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiTarget = env.VITE_API_PROXY_TARGET || "http://127.0.0.1:8001";
  const viaNgrok = env.VITE_NGROK === "1" || env.VITE_NGROK === "true";

  return {
    plugins: [react()],
    server: {
      host: true,
      allowedHosts: true,
      port: 5173,
      strictPort: true,
      // WebSocket HMR via HTTPS ngrok (evite ecran blanc / erreurs WS en dev distant)
      ...(viaNgrok
        ? { hmr: { protocol: "wss", clientPort: 443 } }
        : {}),
      proxy: {
        "/api": { target: apiTarget, changeOrigin: true },
        "/health": { target: apiTarget, changeOrigin: true },
        "/ws": { target: apiTarget, ws: true, changeOrigin: true },
      },
    },
  };
});
