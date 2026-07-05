#!/usr/bin/env bash
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
exec bash "$ROOT/vps/scripts/sync-telegram-env-remote.sh" "$@"
