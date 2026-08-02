#!/usr/bin/env bash
# Stop local esport backend / Vite / matcher started by sh/dev*.sh
set -euo pipefail
# shellcheck disable=SC1091
. "$(cd "$(dirname "$0")" && pwd)/_common.sh"

PORT="${PORT:-${BACKEND_PORT}}"
VITE="${VITE_DEV_PORT:-${VITE_PORT}}"

echo "Stopping changmen local services..."
kill_port "${PORT}"
kill_port "${VITE}"
# matcher:loop / leftover npm children
pkill -f 'matcher:loop|vite|server/backend|start-db.mjs' 2>/dev/null || true
sleep 1

if port_listening "${PORT}" || port_listening "${VITE}"; then
  echo "WARN: some ports still listening:"
  ss -ltn "( sport = :${PORT} or sport = :${VITE} )" 2>/dev/null || true
  exit 1
fi
echo "OK: ports ${PORT} / ${VITE} are free."
