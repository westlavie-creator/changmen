#!/usr/bin/env bash
# Apply changmen Caddyfile (reverse_proxy -> 127.0.0.1:3456). Piped from BAT/setup-caddy.bat.
set -euo pipefail

CADDY_DEST="/etc/caddy/Caddyfile"

log() { echo "==> $*"; }

if [ -z "${CADDY_SRC:-}" ]; then
  for candidate in \
    /root/Caddyfile \
    /root/changmen/deploy/Caddyfile \
    /root/gamebet/deploy/Caddyfile \
    /root/changmen/changmen/scripts/Caddyfile \
    /root/gamebet/changmen/scripts/Caddyfile; do
    if [ -f "$candidate" ]; then
      CADDY_SRC="$candidate"
      break
    fi
  done
fi

if [ -z "${CADDY_SRC:-}" ] || [ ! -f "$CADDY_SRC" ]; then
  echo "ERROR: Caddyfile not found. Upload to /root/Caddyfile or deploy/Caddyfile on VPS"
  exit 1
fi

log "using Caddyfile: $CADDY_SRC"

log "pm2 status"
pm2 status || true

log "node health http://127.0.0.1:3456/"
code="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3456/ || echo 000)"
echo "node_http_code=$code"
if [ "$code" != "200" ]; then
  echo "WARN: Node did not return 200 on :3456 — fix PM2 first: pm2 restart changmen-esport"
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

# Caddy 以 caddy 用户读静态文件，需能 traverse /root（仅 x，不可列目录）
if [ -d /root/changmen ] || [ -d /root/gamebet ]; then
  sudo chmod 711 /root 2>/dev/null || true
fi

log "local curl :80"
curl -s -o /dev/null -w "caddy_http_code=%{http_code}\n" http://127.0.0.1/

log "done — open http://$(curl -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')/"
