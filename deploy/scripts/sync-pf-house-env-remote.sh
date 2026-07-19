#!/usr/bin/env bash
# Upsert Predict.fun house 代下相关 env，然后 restart changmen-esport。
set -euo pipefail

ENV_FILE="${DEPLOY_REPO:-/root/changmen}/server/backend/.env"
if [ ! -f "$ENV_FILE" ] && [ -f "${DEPLOY_REPO:-/root/changmen}/changmen/server/backend/.env" ]; then
  ENV_FILE="${DEPLOY_REPO:-/root/changmen}/changmen/server/backend/.env"
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: missing $ENV_FILE"
  exit 1
fi

PREDICT_FUN_API_BASE="${PREDICT_FUN_API_BASE:-https://api.predict.fun}"
PREDICT_FUN_API_KEY="${PREDICT_FUN_API_KEY:-}"
PREDICT_FUN_PRIVY_PRIVATE_KEY="${PREDICT_FUN_PRIVY_PRIVATE_KEY:-}"
PREDICT_FUN_PREDICT_ACCOUNT="${PREDICT_FUN_PREDICT_ACCOUNT:-}"
PF_HOUSE_MAX_STAKE_USDT="${PF_HOUSE_MAX_STAKE_USDT:-500}"

if [ -z "$PREDICT_FUN_API_KEY" ] || [ -z "$PREDICT_FUN_PRIVY_PRIVATE_KEY" ] || [ -z "$PREDICT_FUN_PREDICT_ACCOUNT" ]; then
  echo "ERROR: PREDICT_FUN_API_KEY / PRIVY_PRIVATE_KEY / PREDICT_ACCOUNT required"
  exit 1
fi

tmp="${ENV_FILE}.tmp.$$"
grep -vE '^(PREDICT_FUN_API_BASE|PREDICT_FUN_API_KEY|PREDICT_FUN_PRIVY_PRIVATE_KEY|PREDICT_FUN_MASTER_PRIVATE_KEY|PREDICT_FUN_PREDICT_ACCOUNT|PF_HOUSE_MAX_STAKE_USDT)=' "$ENV_FILE" > "$tmp" || true
printf 'PREDICT_FUN_API_BASE=%s\n' "$PREDICT_FUN_API_BASE" >> "$tmp"
printf 'PREDICT_FUN_API_KEY=%s\n' "$PREDICT_FUN_API_KEY" >> "$tmp"
printf 'PREDICT_FUN_PRIVY_PRIVATE_KEY=%s\n' "$PREDICT_FUN_PRIVY_PRIVATE_KEY" >> "$tmp"
printf 'PREDICT_FUN_PREDICT_ACCOUNT=%s\n' "$PREDICT_FUN_PREDICT_ACCOUNT" >> "$tmp"
printf 'PF_HOUSE_MAX_STAKE_USDT=%s\n' "$PF_HOUSE_MAX_STAKE_USDT" >> "$tmp"
mv "$tmp" "$ENV_FILE"
chmod 600 "$ENV_FILE"

echo "Updated Predict.fun house env in $ENV_FILE"
echo "PREDICT_FUN_API_BASE=$PREDICT_FUN_API_BASE"
echo "PREDICT_FUN_PREDICT_ACCOUNT=${PREDICT_FUN_PREDICT_ACCOUNT:0:6}…${PREDICT_FUN_PREDICT_ACCOUNT: -4}"
echo "PF_HOUSE_MAX_STAKE_USDT=$PF_HOUSE_MAX_STAKE_USDT"
echo "PREDICT_FUN_API_KEY/PRIVY_PRIVATE_KEY set (not printed)"

if command -v pm2 >/dev/null 2>&1; then
  pm2 restart changmen-esport --update-env
  pm2 status changmen-esport || true
else
  echo "WARN: pm2 not found, restart backend manually"
fi
exit 0
