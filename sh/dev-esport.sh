#!/usr/bin/env bash
# Esport: backend + Vite (+ optional matcher UI with: parity|matcher)
# matchMerge 循环内嵌在 backend，无需单独启动；parity 只多起人工关联 UI。
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
RESTART=0
ARGS=()
for arg in "$@"; do
  case "${arg}" in
    parity|matcher) PARITY=1 ;;
    --no-open) OPEN_BROWSER=0 ;;
    --term) CHANGMEN_USE_TERM=1 ;;
    --restart) RESTART=1 ;;
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
  echo "  Matcher : http://localhost:4567/  (人工关联 UI；matchMerge 已内嵌 backend)"
fi
echo
echo "  Tip: ./sh/dev-esport.sh parity"
echo "       ./sh/dev-esport.sh --restart   # 强制重启（端口被残留进程占用时用）"
echo "       ./sh/status-dev.sh          - check ports"
echo "       ./sh/stop-dev.sh            - stop services"
echo

# 启动一个服务：端口空闲直接起；被占用时按 --restart 决定复用还是强制重启。
start_service() {
  local title="$1" port="$2"
  shift 2
  local start_cmd="$*"

  if port_listening "${port}"; then
    if [[ "${RESTART}" == "1" ]]; then
      echo "[!] Port ${port} 被占用，--restart 强制重启："
      port_owner "${port}" || true
      kill_port "${port}"
      sleep 1
    else
      echo "Port ${port} already in use — reusing existing ${title}"
      port_owner "${port}" || true
      echo "  (若这是残留进程，先 ./sh/stop-dev.sh 或用 ./sh/dev-esport.sh --restart)"
      return 0
    fi
  fi

  echo "Starting ${title}..."
  run_in_term "${title}" "${start_cmd}"
  wait_port "${port}" "${title}" 90 || {
    echo "ERROR: ${title} failed to listen. See ${LOG_DIR}/${title}.log" >&2
    tail -30 "${LOG_DIR}/${title}.log" 2>/dev/null || true
    exit 1
  }
}

# Avoid stale listeners from a previous half-start
start_service "backend" "${PORT}" \
  "export PORT=${PORT} A8_AUTH=0 SKIP_APP_BUILD=1; cd \"${ROOT}\" && \"${SH_DIR}/backend.sh\""

start_service "vite" "${VITE}" \
  "export VITE_DEV_PORT=${VITE}; cd \"${ROOT}\" && npm run app:dev"

if [[ "${PARITY}" == "1" ]]; then
  echo "[3/3] Starting matcher UI..."
  run_in_term "matcher" "cd \"${ROOT}\" && npm run matcher:ui"
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
