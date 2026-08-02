#!/usr/bin/env bash
set -euo pipefail
SH_DIR="$(cd "$(dirname "$0")" && pwd)"
export DEPLOY_HOST="${DEPLOY_HOST:-106.14.82.50}"
export DEPLOY_SKIP_TELEGRAM_CHECK="${DEPLOY_SKIP_TELEGRAM_CHECK:-1}"
exec "${SH_DIR}/deploy-server-core.sh" "$@"
