#!/usr/bin/env bash
set -euo pipefail
# shellcheck disable=SC1091
. "$(cd "$(dirname "$0")" && pwd)/_common.sh"
resolve_root
require_npm
cd "${ROOT}"
exec node scripts/sync/sync-telegram-env.mjs
