#!/usr/bin/env bash
# Stop local esport backend / Vite started by sh/dev*.sh
set -euo pipefail
# shellcheck disable=SC1091
. "$(cd "$(dirname "$0")" && pwd)/_common.sh"
resolve_root

PORT="${PORT:-${BACKEND_PORT}}"
VITE="${VITE_DEV_PORT:-${VITE_PORT}}"
LOG_DIR="${LOG_DIR:-/tmp/changmen-dev}"

echo "Stopping changmen local services..."

# Prefer pidfiles written by run_in_term
for name in backend vite matcher; do
  pidfile="${LOG_DIR}/${name}.pid"
  if [[ -f "${pidfile}" ]]; then
    pid="$(cat "${pidfile}" 2>/dev/null || true)"
    if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then
      kill "${pid}" 2>/dev/null || true
    fi
    rm -f "${pidfile}"
  fi
done

kill_port "${PORT}"
kill_port "${VITE}"

# Narrow cleanup: only our known entrypoints (avoid broad pkill)
pkill -f "${ROOT}/server/backend/scripts/start-db.mjs" 2>/dev/null || true
pkill -f "vite.*/client/web" 2>/dev/null || true
pkill -f "npm run app:dev" 2>/dev/null || true
pkill -f "npm run matcher:loop" 2>/dev/null || true
sleep 1

if port_listening "${PORT}" || port_listening "${VITE}"; then
  echo "WARN: some ports still listening:"
  ss -ltn "( sport = :${PORT} or sport = :${VITE} )" 2>/dev/null || true
  exit 1
fi
echo "OK: ports ${PORT} / ${VITE} are free."
