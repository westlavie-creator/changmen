#!/usr/bin/env bash
# Football sibling repo backend (../changmen-football)
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
export FOOTBALL_PORT="${PORT}"

cd "${FOOTBALL_ROOT}"

echo
echo "========================================"
echo "  changmen-football - port ${PORT}"
echo "========================================"
echo "  App : http://127.0.0.1:${PORT}/football/"
echo
echo "[1/2] Stop old process on port ${PORT} ..."
kill_port "${PORT}"
sleep 1
echo "[2/2] npm run dev ..."
exec npm run dev
