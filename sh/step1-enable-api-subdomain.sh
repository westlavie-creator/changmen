#!/usr/bin/env bash
# 本机：步骤 1 启用 api.changmen.fun（上传 Caddy 模板并在 VPS 执行 remote 脚本）
# 前置：DNS A  api.changmen.fun → 47.57.10.202
set -euo pipefail
# shellcheck disable=SC1091
. "$(cd "$(dirname "$0")" && pwd)/_common.sh"
resolve_root

DEPLOY_USER="${DEPLOY_USER:-root}"
DEPLOY_HOST="${DEPLOY_HOST:-47.57.10.202}"
EXPECTED_IP="${EXPECTED_IP:-47.57.10.202}"

load_deploy_local
ssh_opts
REMOTE="${DEPLOY_USER}@${DEPLOY_HOST}"

CADDY_LOCAL="${ROOT}/certificate/Caddyfile.dual.example"
REMOTE_SCRIPT="${ROOT}/deploy/scripts/step1-enable-api-subdomain-remote.sh"
REMOTE_CADDY="/root/changmen/certificate/Caddyfile.dual.example"

[[ -f "${CADDY_LOCAL}" ]] || { echo "ERROR: missing ${CADDY_LOCAL}" >&2; exit 1; }
[[ -f "${REMOTE_SCRIPT}" ]] || { echo "ERROR: missing ${REMOTE_SCRIPT}" >&2; exit 1; }

echo
echo "========================================"
echo "  Step1: enable api.changmen.fun (dual)"
echo "========================================"
echo "  Target: ${REMOTE}"
echo "  DNS:    api.changmen.fun → ${EXPECTED_IP}"
echo

echo "[1/3] Upload Caddyfile.dual.example ..."
ssh "${SSH_OPTS[@]}" "${REMOTE}" "mkdir -p /root/changmen/certificate /root/changmen/deploy/scripts"
scp "${SSH_OPTS[@]}" "${CADDY_LOCAL}" "${REMOTE}:${REMOTE_CADDY}"
scp "${SSH_OPTS[@]}" "${REMOTE_SCRIPT}" "${REMOTE}:/root/changmen/deploy/scripts/step1-enable-api-subdomain-remote.sh"

echo "[2/3] Run remote enable (certbot expand + caddy reload) ..."
ssh "${SSH_OPTS[@]}" "${REMOTE}" \
  "EXPECTED_IP=${EXPECTED_IP} CADDY_SRC=${REMOTE_CADDY} bash /root/changmen/deploy/scripts/step1-enable-api-subdomain-remote.sh"

echo "[3/3] Probe api health from this machine (mTLS) ..."
CERT="${ROOT}/certificate/out/clients/RIVER.crt"
KEY="${ROOT}/certificate/out/clients/RIVER.key"
if [[ -f "${CERT}" && -f "${KEY}" ]]; then
  curl -sS -m 20 --cert "${CERT}" --key "${KEY}" -w "\nhttp=%{http_code}\n" \
    "https://api.changmen.fun/health" | head -c 200
  echo
else
  echo "WARN: RIVER cert not found; skip local probe."
fi

echo
echo "Done. 可随时停在步骤 1：用户仍只访问 changmen.fun。"
echo "回滚：恢复 /etc/caddy/Caddyfile.bak.step1.* 并 caddy reload；LE 可保留 api SAN。"
