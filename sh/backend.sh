#!/usr/bin/env bash
# Esport backend only (Linux default port 3456)
set -euo pipefail
# shellcheck disable=SC1091
. "$(cd "$(dirname "$0")" && pwd)/_common.sh"
resolve_root
require_npm

PORT="${PORT:-${BACKEND_PORT}}"
export PORT
export A8_AUTH="${A8_AUTH:-0}"
export SKIP_APP_BUILD="${SKIP_APP_BUILD:-1}"

cd "${ROOT}/server/backend"

echo
echo "========================================"
echo "  changmen Backend - port ${PORT}"
echo "========================================"
echo "  App : http://localhost:${PORT}/"
echo
echo "[1/2] Stop old process on port ${PORT} ..."
kill_port "${PORT}"
sleep 1
echo "[2/2] npm run web ..."
exec npm run web
