#!/usr/bin/env bash
# Hong Kong: git pull 在 CHANGMEN_GIT_REPO，同步 changmen/ -> 扁平 DEPLOY_REPO，再 deploy。
set -euo pipefail

GIT_REPO="${CHANGMEN_GIT_REPO:-/root/changmen-repo}"
APP_ROOT="${DEPLOY_REPO:-/root/changmen}"
SRC="$GIT_REPO/changmen"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ ! -f "$SRC/package.json" ]; then
  echo "ERROR: missing $SRC/package.json (git repo layout?)"
  exit 1
fi

log() { echo "==> $*"; }

preserve_backend_secrets() {
  local backup="/tmp/changmen-preserve.$$"
  rm -rf "$backup"
  mkdir -p "$backup"
  for base in "$APP_ROOT/server/backend" "$SRC/server/backend"; do
    if [ -f "$base/.env" ]; then
      cp -a "$base/.env" "$backup/.env"
    fi
    if [ -d "$base/storage" ]; then
      rm -rf "$backup/storage"
      cp -a "$backup/storage" "$backup/storage"
    fi
  done
  PRESERVE_BACKUP="$backup"
}

restore_backend_secrets() {
  local backup="${PRESERVE_BACKUP:-}"
  [ -n "$backup" ] || return 0
  mkdir -p "$APP_ROOT/server/backend"
  if [ -f "$backup/.env" ]; then
    cp -a "$backup/.env" "$APP_ROOT/server/backend/.env"
  fi
  if [ -d "$backup/storage" ]; then
    rm -rf "$APP_ROOT/server/backend/storage"
    cp -a "$backup/storage" "$APP_ROOT/server/backend/storage"
  fi
  rm -rf "$backup"
  PRESERVE_BACKUP=""
}

log "sync $SRC/ -> $APP_ROOT/ (keep .env + storage)"
mkdir -p "$APP_ROOT"
preserve_backend_secrets
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete \
    --exclude server/backend/.env \
    --exclude server/backend/storage \
    "$SRC/" "$APP_ROOT/"
else
  tar -C "$SRC" -cf - \
    --exclude=./server/backend/.env \
    --exclude=./server/backend/storage \
    . | tar -C "$APP_ROOT" -xf -
fi
restore_backend_secrets

export DEPLOY_REPO="$APP_ROOT"
export CHANGMEN_GIT_REPO="$GIT_REPO"
OLD_HEAD="${DEPLOY_OLD_HEAD:-}"
NEW_HEAD="${DEPLOY_NEW_HEAD:-}"
if [ -z "$OLD_HEAD" ] || [ -z "$NEW_HEAD" ]; then
  if [ -d "$GIT_REPO/.git" ]; then
    NEW_HEAD="$(git -C "$GIT_REPO" rev-parse HEAD)"
    OLD_HEAD="${OLD_HEAD:-$NEW_HEAD}"
  fi
fi
export DEPLOY_OLD_HEAD="$OLD_HEAD"
export DEPLOY_NEW_HEAD="$NEW_HEAD"

log "deploy from $APP_ROOT (git ${NEW_HEAD:0:8})"
bash "$SCRIPT_DIR/deploy-server-remote.sh"
