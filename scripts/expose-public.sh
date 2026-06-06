#!/usr/bin/env bash
# Expose HydroTrack (frontend 5173 + API via proxy Vite) sur Internet.
# Prerequis : backend (8001) et frontend (5173) deja demarres.

set -euo pipefail

PORT="${HYDROTRACK_PORT:-5173}"
MODE="${1:-ngrok}"
API_PORT="${HYDROTRACK_API_PORT:-8001}"
NGROK_API="http://127.0.0.1:4040"

ngrok_public_url() {
  curl -sf "${NGROK_API}/api/tunnels" 2>/dev/null | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
except json.JSONDecodeError:
    sys.exit(1)
for t in d.get('tunnels', []):
    if t.get('proto') == 'https':
        print(t['public_url'])
        break
else:
    ts = d.get('tunnels', [])
    print(ts[0]['public_url'] if ts else '')
" 2>/dev/null || true
}

print_prereqs() {
  echo "=== HydroTrack — exposition publique (port ${PORT}) ==="
  echo "Backend  : http://127.0.0.1:${API_PORT} (uvicorn, doit tourner)"
  echo "Frontend : http://0.0.0.0:${PORT} (npm run dev dans frontend/)"
  echo ""
}

print_tunnel_help() {
  local url="$1"
  echo ""
  echo ">>> Ouvrez dans le navigateur : ${url}"
  echo ""
  echo "Plan ngrok gratuit : une page d'avertissement peut s'afficher."
  echo "  Cliquez sur « Visit Site » (pas une page blanche — c'est normal)."
  echo ""
  echo "Inspecteur ngrok : ${NGROK_API}"
  echo "Ne relancez pas ngrok si le tunnel tourne deja (erreur ERR_NGROK_334)."
  echo "  Arreter : pkill -f 'ngrok http'   ou Ctrl+C dans le terminal ngrok."
  echo ""
  echo "En local (meme machine) : http://127.0.0.1:${PORT}/"
}

case "${MODE}" in
  status)
    print_prereqs
    url="$(ngrok_public_url)"
    if [[ -n "${url}" ]]; then
      echo "Tunnel ngrok ACTIF."
      print_tunnel_help "${url}"
      exit 0
    fi
    echo "Aucun tunnel ngrok actif (port 4040)."
    exit 1
    ;;
  stop)
    if pkill -f "ngrok http ${PORT}" 2>/dev/null; then
      echo "Tunnel ngrok arrete."
    else
      echo "Aucun processus ngrok http ${PORT} trouve."
    fi
    exit 0
    ;;
  ngrok)
    print_prereqs
    if ! command -v ngrok >/dev/null 2>&1; then
      echo "ngrok absent. Installation :"
      echo "  sudo snap install ngrok"
      echo "Puis : https://dashboard.ngrok.com/get-started/your-authtoken"
      echo "  ngrok config add-authtoken VOTRE_TOKEN"
      exit 1
    fi
    existing="$(ngrok_public_url)"
    if [[ -n "${existing}" ]]; then
      echo "Tunnel deja en ligne (ne pas relancer ngrok) :"
      print_tunnel_help "${existing}"
      exit 0
    fi
    echo "Demarrage ngrok http ${PORT} ..."
    print_tunnel_help "(URL affichee par ngrok ci-dessous)"
    exec ngrok http "${PORT}"
    ;;
  cloudflare|cloudflared)
    print_prereqs
    if ! command -v cloudflared >/dev/null 2>&1; then
      echo "cloudflared absent. sudo apt install cloudflared"
      exit 1
    fi
    exec cloudflared tunnel --url "http://localhost:${PORT}"
    ;;
  localtunnel|lt)
    print_prereqs
    exec npx --yes localtunnel --port "${PORT}"
    ;;
  *)
    echo "Usage: $0 [ngrok|status|stop|cloudflare|localtunnel]"
    exit 1
    ;;
esac
