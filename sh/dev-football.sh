#!/usr/bin/env bash
# Start football sibling server in a separate terminal
set -euo pipefail
# shellcheck disable=SC1091
. "$(cd "$(dirname "$0")" && pwd)/_common.sh"
resolve_root
require_npm

FOOTBALL_ROOT="$(cd "${ROOT}/../changmen-football" 2>/dev/null && pwd || true)"
if [[ -z "${FOOTBALL_ROOT}" || ! -f "${FOOTBALL_ROOT}/server.js" ]]; then
  echo "ERROR: changmen-football not found at ${ROOT}/../changmen-football" >&2
  echo "       Expected sibling: ../changmen-football/" >&2
  exit 1
fi

PORT="${FOOTBALL_PORT}"
RESTART=0
for arg in "$@"; do
  case "${arg}" in
    --restart) RESTART=1 ;;
    *) ;;
  esac
done

echo
echo "========================================"
echo "  changmen-football Dev"
echo "========================================"
echo "  Root    : ${FOOTBALL_ROOT}"
echo "  Football: http://127.0.0.1:${PORT}/  (→ /football/)"
echo "  API     : http://127.0.0.1:${PORT}/football/api/health"
echo
echo "  Tip: copy .env.example to .env, set JWT_SECRET (same as esport)"
echo "       ESPORT_CONSOLE_URL=http://localhost:${VITE_PORT}/ for local link"
echo "       ./sh/dev-football.sh --restart  # 端口被残留进程占用时强制重启"
echo

if port_listening "${PORT}"; then
  echo "Port ${PORT} already in use — reusing existing football server"
  port_owner "${PORT}" || true
  if [[ "${RESTART}" == "1" ]]; then
    echo "[!] --restart 强制重启："
    kill_port "${PORT}"
    sleep 1
  else
    echo "  (若这是残留进程，用 ./sh/dev-football.sh --restart)"
    exit 0
  fi
fi

echo "[1/1] Starting football server..."
run_in_term "football" \
  "export FOOTBALL_PORT=${PORT}; \"${SH_DIR}/football-backend.sh\""

wait_port "${PORT}" "football" 60 || {
  echo "ERROR: football failed to listen. See ${LOG_DIR}/football.log" >&2
  exit 1
}

echo
echo "[OK] Open http://127.0.0.1:${PORT}/  or  http://127.0.0.1:${PORT}/football/"
echo "     Logs: ${LOG_DIR}/football.log"
open_browser "http://127.0.0.1:${PORT}/football/"
