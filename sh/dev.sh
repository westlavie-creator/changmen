#!/usr/bin/env bash
# Legacy entry — prefer sh/dev-esport.sh or sh/dev-football.sh
set -euo pipefail
SH_DIR="$(cd "$(dirname "$0")" && pwd)"

if [[ "${1:-}" == "football" ]]; then
  exec "${SH_DIR}/dev-football.sh"
fi

echo "Tip: sh/dev-esport.sh (电竞)   sh/dev-football.sh (足球)"
echo
exec "${SH_DIR}/dev-esport.sh" "$@"
