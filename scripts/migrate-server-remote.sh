#!/usr/bin/env bash
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
exec bash "$ROOT/vps/scripts/migrate-server-remote.sh" "$@"
