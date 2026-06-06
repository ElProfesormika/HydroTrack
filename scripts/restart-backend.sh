#!/usr/bin/env bash
# Arrete tout processus sur le port 8000 et relance l'API a jour.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)/backend"
FRONTEND_ENV="${ROOT}/../frontend/.env.development"

pick_port() {
  local ports=()
  [ -n "${HYDROTRACK_API_PORT:-}" ] && ports+=("${HYDROTRACK_API_PORT}")
  ports+=(8000 8001 8002)
  for p in "${ports[@]}"; do
    if ! lsof -i ":${p}" >/dev/null 2>&1; then
      echo "${p}"
      return 0
    fi
    echo "Port ${p} occupe (processus peut-etre lance par Cursor — fermez ce terminal ou utilisez le port suivant)." >&2
  done
  return 1
}

PORT="$(pick_port)" || {
  echo "Aucun port libre (8000-8002). Fermez l'onglet terminal Cursor qui execute uvicorn, ou redemarrez la session."
  exit 1
}

echo "Liberation du port ${PORT} (si vous en etes proprietaire)..."
fuser -k "${PORT}/tcp" 2>/dev/null || true
pkill -f "uvicorn app.main:app.*--port ${PORT}" 2>/dev/null || true
sleep 1

if lsof -i ":${PORT}" >/dev/null 2>&1; then
  echo "Le port ${PORT} reste occupe — essayez un autre port : HYDROTRACK_API_PORT=8002 $0"
  exit 1
fi

if [ "${PORT}" != "8000" ]; then
  echo "VITE_API_PROXY_TARGET=http://127.0.0.1:${PORT}" > "${FRONTEND_ENV}"
  echo "Frontend configure pour le port ${PORT} (fichier frontend/.env.development)."
fi

cd "${ROOT}"
source .venv/bin/activate
echo "Demarrage API sur 0.0.0.0:${PORT} ..."
exec uvicorn app.main:app --reload --host 0.0.0.0 --port "${PORT}"
