#!/usr/bin/env bash
# Upsert PM HK 出口 http-relay env on VPS .env, then restart changmen-web.
set -euo pipefail

ENV_FILE="${DEPLOY_REPO:-/root/changmen}/server/backend/.env"
if [ ! -f "$ENV_FILE" ] && [ -f "${DEPLOY_REPO:-/root/changmen}/changmen/server/backend/.env" ]; then
  ENV_FILE="${DEPLOY_REPO:-/root/changmen}/changmen/server/backend/.env"
fi

HTTP_RELAY_REQUIRE_TOKEN="${HTTP_RELAY_REQUIRE_TOKEN:-1}"
HTTP_RELAY_ALLOWED_HOSTS="${HTTP_RELAY_ALLOWED_HOSTS:-gamma-api.polymarket.com,clob.polymarket.com}"
HTTP_RELAY_ALLOWED_PATH_PREFIXES="${HTTP_RELAY_ALLOWED_PATH_PREFIXES:-/}"
HTTP_RELAY_ALLOW_PRIVATE="${HTTP_RELAY_ALLOW_PRIVATE:-0}"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: missing $ENV_FILE"
  exit 1
fi

tmp="${ENV_FILE}.tmp.$$"
grep -vE '^(HTTP_RELAY_REQUIRE_TOKEN|HTTP_RELAY_ALLOWED_HOSTS|HTTP_RELAY_ALLOWED_PATH_PREFIXES|HTTP_RELAY_ALLOW_PRIVATE)=' "$ENV_FILE" > "$tmp" || true
printf 'HTTP_RELAY_REQUIRE_TOKEN=%s\n' "$HTTP_RELAY_REQUIRE_TOKEN" >> "$tmp"
printf 'HTTP_RELAY_ALLOWED_HOSTS=%s\n' "$HTTP_RELAY_ALLOWED_HOSTS" >> "$tmp"
printf 'HTTP_RELAY_ALLOWED_PATH_PREFIXES=%s\n' "$HTTP_RELAY_ALLOWED_PATH_PREFIXES" >> "$tmp"
printf 'HTTP_RELAY_ALLOW_PRIVATE=%s\n' "$HTTP_RELAY_ALLOW_PRIVATE" >> "$tmp"
mv "$tmp" "$ENV_FILE"
chmod 600 "$ENV_FILE"
echo "Updated HTTP_RELAY_* in $ENV_FILE"
echo "HTTP_RELAY_REQUIRE_TOKEN=$HTTP_RELAY_REQUIRE_TOKEN"
echo "HTTP_RELAY_ALLOWED_HOSTS=$HTTP_RELAY_ALLOWED_HOSTS"

if command -v pm2 >/dev/null 2>&1; then
  pm2 restart changmen-web --update-env
  pm2 status changmen-web || true
  echo ""
  echo "Run probe:"
  echo "  cd $(dirname "$ENV_FILE") && node scripts/probe-pm-hk-relay.mjs"
else
  echo "WARN: pm2 not found, restart backend manually then run probe-pm-hk-relay.mjs"
fi
exit 0
