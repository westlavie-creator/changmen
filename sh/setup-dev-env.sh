#!/usr/bin/env bash
# First-time: copy server/backend/.env.example → .env
set -euo pipefail
# shellcheck disable=SC1091
. "$(cd "$(dirname "$0")" && pwd)/_common.sh"
resolve_root

EXAMPLE="${ROOT}/server/backend/.env.example"
DEST="${ROOT}/server/backend/.env"

if [[ -f "${DEST}" ]]; then
  echo "OK: exists ${DEST}"
  exit 0
fi
if [[ ! -f "${EXAMPLE}" ]]; then
  echo "ERROR: missing ${EXAMPLE}" >&2
  exit 1
fi
cp -f "${EXAMPLE}" "${DEST}"
echo "OK: created ${DEST}"
echo "Edit JWT_SECRET, DATABASE_URL, then run: sh/dev.sh"
