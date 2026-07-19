#!/bin/bash
# Install esport :3456 watchdog cron on this VPS (run as root on the server).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC="$ROOT/deploy/scripts/esport-watchdog.sh"
DST="/usr/local/bin/changmen-esport-watchdog.sh"
CRON_KEY="changmen-esport-watchdog"

if [[ ! -f "$SRC" ]]; then
  echo "missing $SRC" >&2
  exit 1
fi

install -m 755 "$SRC" "$DST"
touch /var/log/changmen-esport-watchdog.log

# every minute
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
# smoke once
"$DST" || true
tail -n 5 /var/log/changmen-esport-watchdog.log 2>/dev/null || true
