#!/usr/bin/env bash
# 一次性：香港 VPS 迁到与上海相同的扁平布局（仅 /root/changmen，无 git）。
# 用法：bash flatten-hk-vps.sh
set -euo pipefail

APP_ROOT="${DEPLOY_REPO:-/root/changmen}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

log() { echo "==> $*"; }

if [ -f "$APP_ROOT/package.json" ] && [ -d "$APP_ROOT/server/backend" ] && [ ! -d "$APP_ROOT/.git" ] && [ ! -d "$APP_ROOT/changmen" ]; then
  log "already flat at $APP_ROOT"
  exit 0
fi

if [ ! -d "$APP_ROOT" ] && [ -d /root/gamebet ]; then
  log "migrate /root/gamebet -> $APP_ROOT"
  mv /root/gamebet "$APP_ROOT"
fi

if [ -d /root/changmen-repo ] && [ ! -d "$APP_ROOT/server/backend" ]; then
  log "migrate /root/changmen-repo -> $APP_ROOT"
  mv /root/changmen-repo "$APP_ROOT"
fi

export DEPLOY_REPO="$APP_ROOT"
export FLATTEN_ONLY=1
export CHANGMEN_DEPLOY_SCRIPTS="${CHANGMEN_DEPLOY_SCRIPTS:-/tmp/changmen-deploy}"
mkdir -p "$CHANGMEN_DEPLOY_SCRIPTS"
cp -a "$SCRIPT_DIR/apply-repo-archive.sh" "$SCRIPT_DIR/deploy-server-remote.sh" "$CHANGMEN_DEPLOY_SCRIPTS/"

log "flatten $APP_ROOT (same layout as Shanghai)"
bash "$CHANGMEN_DEPLOY_SCRIPTS/apply-repo-archive.sh" /dev/null

if [ -f /etc/caddy/Caddyfile ]; then
  sed -i \
    -e 's|/root/changmen/changmen/client/web/dist|/root/changmen/client/web/dist|g' \
    -e 's|/root/gamebet/changmen/client/web/dist|/root/changmen/client/web/dist|g' \
    -e 's|/root/changmen-repo/changmen/client/web/dist|/root/changmen/client/web/dist|g' \
    /etc/caddy/Caddyfile
  caddy validate --config /etc/caddy/Caddyfile
  systemctl reload caddy
fi

if command -v pm2 >/dev/null 2>&1 && [ -f "$APP_ROOT/deploy/ecosystem.config.cjs" ]; then
  pm2 delete gamebet-web gamebet-pm-sports gamebet-matcher changmen-web changmen-esport changmen-pm-sports changmen-matcher 2>/dev/null || true
  cd "$APP_ROOT"
  pm2 start deploy/ecosystem.config.cjs
  pm2 save
fi

log "done — flat app at $APP_ROOT (same as Shanghai)"
log "  next: BAT\\deploy-hongkong.bat  or  push master (GHA)"
