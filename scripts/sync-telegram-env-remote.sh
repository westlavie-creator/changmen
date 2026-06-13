#!/usr/bin/env bash
# Piped from BAT/sync-telegram-env.bat — upsert TELEGRAM_BOT_TOKEN on VPS .env
set -euo pipefail

ENV_FILE="${DEPLOY_REPO:-/root/gamebet}/changmen/apps/backend/.env"
TOKEN="${TELEGRAM_BOT_TOKEN:-}"

if [[ -z "$TOKEN" ]]; then
  echo "ERROR: TELEGRAM_BOT_TOKEN empty"
  exit 1
fi
if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: missing $ENV_FILE"
  exit 1
fi

tmp="${ENV_FILE}.tmp.$$"
grep -v '^TELEGRAM_BOT_TOKEN=' "$ENV_FILE" > "$tmp" || true
printf 'TELEGRAM_BOT_TOKEN=%s\n' "$TOKEN" >> "$tmp"
mv "$tmp" "$ENV_FILE"
chmod 600 "$ENV_FILE"
echo "Updated TELEGRAM_BOT_TOKEN in $ENV_FILE"

if command -v pm2 >/dev/null 2>&1; then
  pm2 restart gamebet-web --update-env
  pm2 status gamebet-web || true
else
  echo "WARN: pm2 not found, restart backend manually"
fi
exit 0