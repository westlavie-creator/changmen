#!/usr/bin/env bash
# Pull VPS MarketIndex JSON → local server/backend/storage (dev only).
# Usage:
#   ./sh/sync-market-indexes.sh
#   ./sh/sync-market-indexes.sh --watch
#   ./sh/sync-market-indexes.sh --interval 180 --only polymarket
set -euo pipefail
# shellcheck disable=SC1091
. "$(cd "$(dirname "$0")" && pwd)/_common.sh"
resolve_root
require_npm
cd "${ROOT}"
# optional: load SSH_IDENTITY / DEPLOY_* from local deploy config
if [[ -f "${ROOT}/sh/deploy-server.local.sh" ]]; then
  # shellcheck disable=SC1091
  . "${ROOT}/sh/deploy-server.local.sh"
fi
exec node scripts/sync/pull-vps-market-indexes.mjs "$@"
