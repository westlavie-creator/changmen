#!/usr/bin/env bash
# Upsert Polymarket Builder env on VPS .env, then restart changmen-esport.
set -euo pipefail

ENV_FILE="${DEPLOY_REPO:-/root/changmen}/server/backend/.env"
if [ ! -f "$ENV_FILE" ] && [ -f "${DEPLOY_REPO:-/root/changmen}/changmen/server/backend/.env" ]; then
  ENV_FILE="${DEPLOY_REPO:-/root/changmen}/changmen/server/backend/.env"
fi

: "${POLY_BUILDER_API_KEY:?}"
: "${POLY_BUILDER_SECRET:?}"
: "${POLY_BUILDER_PASSPHRASE:?}"
: "${POLY_BUILDER_CODE:?}"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: missing $ENV_FILE"
  exit 1
fi

tmp="${ENV_FILE}.tmp.$$"
grep -vE '^(POLY_BUILDER_API_KEY|POLY_BUILDER_SECRET|POLY_BUILDER_PASSPHRASE|POLY_BUILDER_CODE)=' "$ENV_FILE" > "$tmp" || true
printf 'POLY_BUILDER_API_KEY=%s\n' "$POLY_BUILDER_API_KEY" >> "$tmp"
printf 'POLY_BUILDER_SECRET=%s\n' "$POLY_BUILDER_SECRET" >> "$tmp"
printf 'POLY_BUILDER_PASSPHRASE=%s\n' "$POLY_BUILDER_PASSPHRASE" >> "$tmp"
printf 'POLY_BUILDER_CODE=%s\n' "$POLY_BUILDER_CODE" >> "$tmp"
mv "$tmp" "$ENV_FILE"
chmod 600 "$ENV_FILE"
echo "Updated POLY_BUILDER_* in $ENV_FILE"

# Masked verify (no full secrets)
api_key="$(grep -E '^POLY_BUILDER_API_KEY=' "$ENV_FILE" | head -n1 | cut -d= -f2-)"
code="$(grep -E '^POLY_BUILDER_CODE=' "$ENV_FILE" | head -n1 | cut -d= -f2-)"
echo "POLY_BUILDER_API_KEY=${api_key:0:8}********"
echo "POLY_BUILDER_CODE=${code:0:10}********"

if command -v pm2 >/dev/null 2>&1; then
  pm2 restart changmen-esport --update-env
  pm2 status changmen-esport || true
else
  echo "WARN: pm2 not found, restart backend manually"
fi
exit 0
