#!/bin/bash
# Restart changmen-predictfun-market-hub when local :3458 /health stops answering.
set -euo pipefail

APP="${WATCHDOG_APP:-changmen-predictfun-market-hub}"
URL="${WATCHDOG_URL:-http://127.0.0.1:3458/health}"
TIMEOUT_SEC="${WATCHDOG_TIMEOUT_SEC:-3}"
FAILS_NEED="${WATCHDOG_FAILS_NEED:-1}"
STATE_DIR="${WATCHDOG_STATE_DIR:-/var/tmp/changmen-watchdog}"
STATE_FILE="$STATE_DIR/predictfun-market-hub-fails"
LOG_FILE="${WATCHDOG_LOG:-/var/log/changmen-predictfun-market-hub-watchdog.log}"
COOLDOWN_SEC="${WATCHDOG_COOLDOWN_SEC:-30}"
COOLDOWN_FILE="$STATE_DIR/predictfun-market-hub-last-restart"

mkdir -p "$STATE_DIR"
touch "$LOG_FILE"

log() {
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $*" | tee -a "$LOG_FILE" >/dev/null
}

code="$(curl -s -o /dev/null -w '%{http_code}' --connect-timeout "$TIMEOUT_SEC" --max-time "$TIMEOUT_SEC" "$URL" || true)"
if [[ "$code" == "200" || "$code" == "301" || "$code" == "302" || "$code" == "304" ]]; then
  echo 0 > "$STATE_FILE"
  exit 0
fi

fails=0
if [[ -f "$STATE_FILE" ]]; then
  fails="$(cat "$STATE_FILE" 2>/dev/null || echo 0)"
fi
fails=$((fails + 1))
echo "$fails" > "$STATE_FILE"
log "health fail code=${code:-000} fails=${fails}/${FAILS_NEED} url=${URL}"

if (( fails < FAILS_NEED )); then
  exit 0
fi

now="$(date +%s)"
if [[ -f "$COOLDOWN_FILE" ]]; then
  last="$(cat "$COOLDOWN_FILE" 2>/dev/null || echo 0)"
  if (( now - last < COOLDOWN_SEC )); then
    log "skip restart cooldown ${COOLDOWN_SEC}s (last=${last})"
    exit 0
  fi
fi

log "restarting ${APP} (local health failed)"
echo "$now" > "$COOLDOWN_FILE"
if ! pm2 restart "$APP" --update-env >/dev/null 2>&1; then
  log "pm2 restart failed; trying start from ecosystem"
  ROOT="${CHANGMEN_ROOT:-/root/changmen}"
  pm2 start "$ROOT/deploy/ecosystem.config.cjs" --only "$APP" --update-env >/dev/null 2>&1 || true
fi
echo 0 > "$STATE_FILE"
log "restart issued for ${APP}"
