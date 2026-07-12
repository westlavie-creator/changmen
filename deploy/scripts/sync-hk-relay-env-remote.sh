#!/usr/bin/env bash
# Upsert 场馆 HK 出海 relay（http-relay / ws-forward）env on VPS .env, then restart changmen-esport.
set -euo pipefail

ENV_FILE="${DEPLOY_REPO:-/root/changmen}/server/backend/.env"
if [ ! -f "$ENV_FILE" ] && [ -f "${DEPLOY_REPO:-/root/changmen}/changmen/server/backend/.env" ]; then
  ENV_FILE="${DEPLOY_REPO:-/root/changmen}/changmen/server/backend/.env"
fi

HK_RELAY_HOSTS_DEFAULT="api.predict.fun,api-testnet.predict.fun"

HTTP_RELAY_REQUIRE_TOKEN="${HTTP_RELAY_REQUIRE_TOKEN:-1}"
# 勿用 VPS shell 里旧的 HTTP_RELAY_ALLOWED_HOSTS；SYNC_HK_RELAY_HOSTS（或旧 SYNC_PM_HK_RELAY_HOSTS）可显式覆盖
if [ -n "${SYNC_HK_RELAY_HOSTS:-${SYNC_PM_HK_RELAY_HOSTS:-}}" ]; then
  HTTP_RELAY_ALLOWED_HOSTS="${SYNC_HK_RELAY_HOSTS:-${SYNC_PM_HK_RELAY_HOSTS:-}}"
else
  HTTP_RELAY_ALLOWED_HOSTS="$HK_RELAY_HOSTS_DEFAULT"
fi
HTTP_RELAY_ALLOWED_PATH_PREFIXES="${HTTP_RELAY_ALLOWED_PATH_PREFIXES:-/}"
HTTP_RELAY_ALLOW_PRIVATE="${HTTP_RELAY_ALLOW_PRIVATE:-0}"
PREDICT_FUN_API_KEY="${PREDICT_FUN_API_KEY:-}"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: missing $ENV_FILE"
  exit 1
fi

tmp="${ENV_FILE}.tmp.$$"
if [ -n "$PREDICT_FUN_API_KEY" ]; then
  grep -vE '^(HTTP_RELAY_REQUIRE_TOKEN|HTTP_RELAY_ALLOWED_HOSTS|HTTP_RELAY_ALLOWED_PATH_PREFIXES|HTTP_RELAY_ALLOW_PRIVATE|PREDICT_FUN_API_KEY)=' "$ENV_FILE" > "$tmp" || true
else
  grep -vE '^(HTTP_RELAY_REQUIRE_TOKEN|HTTP_RELAY_ALLOWED_HOSTS|HTTP_RELAY_ALLOWED_PATH_PREFIXES|HTTP_RELAY_ALLOW_PRIVATE)=' "$ENV_FILE" > "$tmp" || true
fi
printf 'HTTP_RELAY_REQUIRE_TOKEN=%s\n' "$HTTP_RELAY_REQUIRE_TOKEN" >> "$tmp"
printf 'HTTP_RELAY_ALLOWED_HOSTS=%s\n' "$HTTP_RELAY_ALLOWED_HOSTS" >> "$tmp"
printf 'HTTP_RELAY_ALLOWED_PATH_PREFIXES=%s\n' "$HTTP_RELAY_ALLOWED_PATH_PREFIXES" >> "$tmp"
printf 'HTTP_RELAY_ALLOW_PRIVATE=%s\n' "$HTTP_RELAY_ALLOW_PRIVATE" >> "$tmp"
if [ -n "$PREDICT_FUN_API_KEY" ]; then
  printf 'PREDICT_FUN_API_KEY=%s\n' "$PREDICT_FUN_API_KEY" >> "$tmp"
fi
mv "$tmp" "$ENV_FILE"
chmod 600 "$ENV_FILE"
echo "Updated HTTP_RELAY_* in $ENV_FILE"
echo "HTTP_RELAY_REQUIRE_TOKEN=$HTTP_RELAY_REQUIRE_TOKEN"
echo "HTTP_RELAY_ALLOWED_HOSTS=$HTTP_RELAY_ALLOWED_HOSTS"

if command -v pm2 >/dev/null 2>&1; then
  pm2 restart changmen-esport --update-env
  pm2 status changmen-esport || true
  echo ""
  echo "Run probe:"
  echo "  cd $(dirname "$ENV_FILE") && node scripts/ops/diagnostics/probe-hk-relay.mjs"
else
  echo "WARN: pm2 not found, restart backend manually then run probe-hk-relay.mjs"
fi
exit 0
