#!/usr/bin/env bash
# Upload deploy/Caddyfile and apply on VPS
set -euo pipefail
# shellcheck disable=SC1091
. "$(cd "$(dirname "$0")" && pwd)/_common.sh"
resolve_root

DEPLOY_USER="${DEPLOY_USER:-root}"
DEPLOY_HOST="${DEPLOY_HOST:-47.82.100.166}"
CADDY_LOCAL="${ROOT}/deploy/Caddyfile"
REMOTE_SCRIPT="${ROOT}/deploy/scripts/setup-caddy-remote.sh"

load_deploy_local
ssh_opts
REMOTE="${DEPLOY_USER}@${DEPLOY_HOST}"

echo
echo "========================================"
echo "  Setup Caddy reverse proxy (port 80)"
echo "========================================"
echo "  Target: ${REMOTE}"
echo "  Local:  ${CADDY_LOCAL}"
echo

if [[ ! -f "${CADDY_LOCAL}" ]]; then
  echo "ERROR: missing ${CADDY_LOCAL}" >&2
  exit 1
fi
if [[ ! -f "${REMOTE_SCRIPT}" ]]; then
  echo "ERROR: missing ${REMOTE_SCRIPT}" >&2
  exit 1
fi
if ! command -v ssh >/dev/null 2>&1; then
  echo "ERROR: ssh not found." >&2
  exit 1
fi

echo "[1/2] Upload Caddyfile ..."
scp "${SSH_OPTS[@]}" "${CADDY_LOCAL}" "${REMOTE}:/root/Caddyfile"
echo "[2/2] Apply on server ..."
ssh "${SSH_OPTS[@]}" "${REMOTE}" "bash -s" <"${REMOTE_SCRIPT}"
echo
echo "Done. Open http://${DEPLOY_HOST}/"
