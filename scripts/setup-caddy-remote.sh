#!/usr/bin/env bash
# Apply changmen Caddyfile (reverse_proxy -> 127.0.0.1:3456). Piped from BAT/setup-caddy.bat.
set -euo pipefail

CADDY_DEST="/etc/caddy/Caddyfile"

log() { echo "==> $*"; }

if [ -z "${CADDY_SRC:-}" ]; then
  for candidate in /root/Caddyfile /root/gamebet/changmen/scripts/Caddyfile; do
    if [ -f "$candidate" ]; then
      CADDY_SRC="$candidate"
      break
    fi
  done
fi

if [ -z "${CADDY_SRC:-}" ] || [ ! -f "$CADDY_SRC" ]; then
  echo "ERROR: Caddyfile not found. Upload to /root/Caddyfile or git pull changmen/scripts/Caddyfile"
  exit 1
fi

log "using Caddyfile: $CADDY_SRC"

log "pm2 status"
pm2 status || true

log "node health http://127.0.0.1:3456/"
code="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3456/ || echo 000)"
echo "node_http_code=$code"
if [ "$code" != "200" ]; then
  echo "WARN: Node did not return 200 on :3456 — fix PM2 first: pm2 restart gamebet-web"
fi

if [ -f "$CADDY_DEST" ]; then
  sudo cp "$CADDY_DEST" "${CADDY_DEST}.bak.$(date +%Y%m%d%H%M%S)"
fi

log "install Caddyfile -> $CADDY_DEST"
sudo cp "$CADDY_SRC" "$CADDY_DEST"
sudo chown root:root "$CADDY_DEST"
sudo chmod 644 "$CADDY_DEST"

log "validate"
sudo caddy validate --config "$CADDY_DEST"

log "reload caddy"
sudo systemctl reload caddy
sudo systemctl is-active caddy

log "local curl :80"
curl -s -o /dev/null -w "caddy_http_code=%{http_code}\n" http://127.0.0.1/

log "done — open http://$(curl -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')/"
