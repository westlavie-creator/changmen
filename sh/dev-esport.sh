#!/usr/bin/env bash
# Esport: backend + Vite (+ optional matcher with: parity|matcher)
# Usage:
#   ./sh/dev-esport.sh
#   ./sh/dev-esport.sh parity
#   CHANGMEN_USE_TERM=1 ./sh/dev-esport.sh   # try GUI terminals
set -euo pipefail
# shellcheck disable=SC1091
. "$(cd "$(dirname "$0")" && pwd)/_common.sh"
resolve_root
require_npm
load_proxy || true

PORT="${PORT:-${BACKEND_PORT}}"
VITE="${VITE_DEV_PORT:-${VITE_PORT}}"
PARITY=0
OPEN_BROWSER=1
ARGS=()
for arg in "$@"; do
  case "${arg}" in
    parity|matcher) PARITY=1 ;;
    --no-open) OPEN_BROWSER=0 ;;
    --term) CHANGMEN_USE_TERM=1 ;;
    *) ARGS+=("${arg}") ;;
  esac
done
export CHANGMEN_USE_TERM="${CHANGMEN_USE_TERM:-0}"

echo
echo "========================================"
if [[ "${PARITY}" == "1" ]]; then
  echo "  changmen 电竞 Dev + Matcher"
else
  echo "  changmen 电竞 Dev"
fi
echo "========================================"
echo "  Backend : http://localhost:${PORT}/"
echo "  Vite    : http://localhost:${VITE}/   ← 请打开这个（不是 5274）"
echo "  Chrome  : load chrome-extension/"
if [[ "${PARITY}" == "1" ]]; then
  echo "  Matcher : npm run matcher:loop (auto-started)"
fi
echo
echo "  Tip: ./sh/dev-esport.sh parity"
echo "       ./sh/status-dev.sh          - check ports"
echo "       ./sh/stop-dev.sh            - stop services"
echo

# Avoid stale listeners from a previous half-start
if port_listening "${PORT}"; then
  echo "Port ${PORT} already in use — reusing existing backend"
else
  echo "[1/2] Starting backend..."
  run_in_term "backend" \
    "export PORT=${PORT} A8_AUTH=0 SKIP_APP_BUILD=1; cd \"${ROOT}\" && \"${SH_DIR}/backend.sh\""
  wait_port "${PORT}" "Backend" 60 || {
    echo "ERROR: backend failed to listen. See ${LOG_DIR}/backend.log" >&2
    tail -30 "${LOG_DIR}/backend.log" 2>/dev/null || true
    exit 1
  }
fi

if port_listening "${VITE}"; then
  echo "Port ${VITE} already in use — reusing existing Vite"
else
  echo "[2/2] Starting Vite..."
  run_in_term "vite" \
    "export VITE_DEV_PORT=${VITE}; cd \"${ROOT}\" && npm run app:dev"
  wait_port "${VITE}" "Vite" 90 || {
    echo "ERROR: Vite failed to listen. See ${LOG_DIR}/vite.log" >&2
    tail -40 "${LOG_DIR}/vite.log" 2>/dev/null || true
    exit 1
  }
fi

if [[ "${PARITY}" == "1" ]]; then
  echo "[3/3] Starting matcher loop..."
  run_in_term "matcher" "cd \"${ROOT}\" && npm run matcher:loop"
fi

echo
if http_ok "http://127.0.0.1:${VITE}/"; then
  echo "[OK] Vite is up:  http://localhost:${VITE}/"
else
  echo "[OK] Vite port open: http://localhost:${VITE}/  (HTTP check skipped/unavailable)"
fi
echo "     Backend:       http://localhost:${PORT}/"
echo "     Logs:          ${LOG_DIR}/"
echo "     Stop:          ./sh/stop-dev.sh"

if [[ "${OPEN_BROWSER}" == "1" ]]; then
  open_browser "http://localhost:${VITE}/"
fi
