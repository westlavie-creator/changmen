#!/usr/bin/env bash
# Show local esport dev status
set -euo pipefail
# shellcheck disable=SC1091
. "$(cd "$(dirname "$0")" && pwd)/_common.sh"

PORT="${PORT:-${BACKEND_PORT}}"
VITE="${VITE_DEV_PORT:-${VITE_PORT}}"
LOG_DIR="${LOG_DIR:-/tmp/changmen-dev}"

echo "changmen local status"
echo "  Backend :${PORT}  $(port_listening "${PORT}" && echo UP || echo DOWN)"
echo "  Vite    :${VITE}  $(port_listening "${VITE}" && echo UP || echo DOWN)"
if ss -ltn "( sport = :7897 )" 2>/dev/null | grep -q ':7897'; then
  echo "  Proxy   :7897 UP (Clash)"
else
  echo "  Proxy   :7897 DOWN — 请打开 Clash Verge"
fi
echo "  Logs    : ${LOG_DIR}/"
if [[ -f "${LOG_DIR}/backend.log" ]]; then
  echo "  backend.log (tail):"
  tail -5 "${LOG_DIR}/backend.log" | sed 's/^/    /'
fi
if port_listening "${VITE}"; then
  echo "  Open: http://localhost:${VITE}/"
fi
