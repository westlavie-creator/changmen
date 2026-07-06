#!/usr/bin/env bash
# Run on VPS (Aliyun Workbench / SSH). No scp needed if repo already on server.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VPS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
export CADDY_SRC="${CADDY_SRC:-$VPS_DIR/Caddyfile}"
exec bash "$SCRIPT_DIR/setup-caddy-remote.sh"
