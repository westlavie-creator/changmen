#!/usr/bin/env bash
# Deprecated path — use vps/scripts/deploy-server-remote.sh
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
exec bash "$ROOT/vps/scripts/deploy-server-remote.sh" "$@"
