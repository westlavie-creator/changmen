#!/bin/bash
# Install PREDICTFUN-MARKET hub :3458 watchdog cron on this VPS (run as root on the server).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC="$ROOT/deploy/scripts/predictfun-market-hub-watchdog.sh"
DST="/usr/local/bin/changmen-predictfun-market-hub-watchdog.sh"
CRON_KEY="changmen-predictfun-market-hub-watchdog"

if [[ ! -f "$SRC" ]]; then
  echo "missing $SRC" >&2
  exit 1
fi

install -m 755 "$SRC" "$DST"
touch /var/log/changmen-predictfun-market-hub-watchdog.log

line="* * * * * root $DST >/dev/null 2>&1"
if [[ -d /etc/cron.d ]]; then
  echo "$line" > "/etc/cron.d/${CRON_KEY}"
  chmod 644 "/etc/cron.d/${CRON_KEY}"
  echo "installed /etc/cron.d/${CRON_KEY}"
else
  (crontab -l 2>/dev/null | grep -v "$DST" || true; echo "* * * * * $DST >/dev/null 2>&1") | crontab -
  echo "installed user crontab entry"
fi

echo "watchdog ready: $DST"
"$DST" || true
tail -n 5 /var/log/changmen-predictfun-market-hub-watchdog.log 2>/dev/null || true
