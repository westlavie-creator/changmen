#!/usr/bin/env bash
# Legacy alias — same as deploy-hongkong.sh
set -euo pipefail
exec "$(cd "$(dirname "$0")" && pwd)/deploy-hongkong.sh" "$@"
