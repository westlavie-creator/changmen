#!/usr/bin/env bash
# Piped from sync-telegram-env.mjs — upsert Telegram admin vars on VPS .env
set -euo pipefail

ENV_FILE="${DEPLOY_REPO:-/root/changmen}/server/backend/.env"
if [ ! -f "$ENV_FILE" ] && [ -f "${DEPLOY_REPO:-/root/changmen}/changmen/server/backend/.env" ]; then
  ENV_FILE="${DEPLOY_REPO:-/root/changmen}/changmen/server/backend/.env"
fi
TOKEN="${TELEGRAM_BOT_TOKEN:-}"
ADMIN_CHAT="${TELEGRAM_ADMIN_CHAT_ID:-}"

if [[ -z "$TOKEN" ]]; then
  echo "ERROR: TELEGRAM_BOT_TOKEN empty"
  exit 1
fi
if [[ -z "$ADMIN_CHAT" ]]; then
  echo "ERROR: TELEGRAM_ADMIN_CHAT_ID empty"
  exit 1
fi
if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: missing $ENV_FILE"
  exit 1
fi

tmp="${ENV_FILE}.tmp.$$"
grep -vE '^(TELEGRAM_BOT_TOKEN|TELEGRAM_ADMIN_CHAT_ID)=' "$ENV_FILE" > "$tmp" || true
printf 'TELEGRAM_BOT_TOKEN=%s\n' "$TOKEN" >> "$tmp"
printf 'TELEGRAM_ADMIN_CHAT_ID=%s\n' "$ADMIN_CHAT" >> "$tmp"
mv "$tmp" "$ENV_FILE"
chmod 600 "$ENV_FILE"
echo "Updated TELEGRAM_BOT_TOKEN + TELEGRAM_ADMIN_CHAT_ID in $ENV_FILE"

if command -v pm2 >/dev/null 2>&1; then
  pm2 restart changmen-esport --update-env
  pm2 status changmen-esport || true
else
  echo "WARN: pm2 not found, restart backend manually"
fi
exit 0