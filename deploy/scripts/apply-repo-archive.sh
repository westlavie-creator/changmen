#!/usr/bin/env bash
# Apply app tarball onto DEPLOY_REPO (flat app root; preserves .env + storage), then deploy.
# Used by BAT/deploy-shanghai.bat (PC packs changmen/ only; Shanghai VPS cannot git pull).
set -euo pipefail

ARCHIVE="${1:?usage: apply-repo-archive.sh /path/to/changmen-repo.tgz}"
ROOT="${DEPLOY_REPO:?DEPLOY_REPO is required}"

if [ "${FLATTEN_ONLY:-0}" != "1" ] && [ ! -f "$ARCHIVE" ]; then
  echo "ERROR: missing archive $ARCHIVE"
  exit 1
fi

if [ "$ROOT" = /root/changmen ] && [ ! -d "$ROOT" ] && [ -d /root/gamebet ]; then
  echo "==> migrate DEPLOY_REPO /root/gamebet -> /root/changmen"
  mv /root/gamebet /root/changmen
fi

preserve_backend_secrets() {
  local backup="/tmp/changmen-preserve.$$"
  rm -rf "$backup"
  mkdir -p "$backup"
  for base in "$ROOT/server/backend" "$ROOT/changmen/server/backend" "$ROOT/changmen/changmen/server/backend"; do
    if [ -f "$base/.env" ]; then
      cp -a "$base/.env" "$backup/.env"
    fi
    if [ -d "$base/storage" ]; then
      rm -rf "$backup/storage"
      cp -a "$base/storage" "$backup/storage"
    fi
  done
  PRESERVE_BACKUP="$backup"
}

restore_backend_secrets() {
  local backup="${PRESERVE_BACKUP:-}"
  [ -n "$backup" ] || return 0
  mkdir -p "$ROOT/server/backend"
  if [ -f "$backup/.env" ]; then
    cp -a "$backup/.env" "$ROOT/server/backend/.env"
  fi
  if [ -d "$backup/storage" ]; then
    rm -rf "$ROOT/server/backend/storage"
    cp -a "$backup/storage" "$ROOT/server/backend/storage"
  fi
  rm -rf "$backup"
  PRESERVE_BACKUP=""
}

flatten_legacy_nested_repo() {
  local nested="$ROOT/changmen"
  local deep="$ROOT/changmen/changmen"

  preserve_backend_secrets

  if [ -d "$deep/server/backend" ]; then
    nested="$deep"
    echo "==> flatten legacy $deep -> flat app at $ROOT"
  elif [ -d "$nested/server/backend" ] && [ -f "$nested/package.json" ]; then
    echo "==> flatten legacy $nested -> flat app at $ROOT"
  elif [ -d "$nested" ] && [ ! -f "$nested/package.json" ]; then
    echo "==> remove stale nested dir $nested"
    rm -rf "$nested"
    restore_backend_secrets
    return 0
  else
    restore_backend_secrets
    return 0
  fi

  if [ -d "$ROOT/server/backend" ] && [ -f "$ROOT/package.json" ] && [ ! -f "$nested/package.json" ]; then
    restore_backend_secrets
    return 0
  fi

  local staging="/tmp/changmen-flatten.$$"
  rm -rf "$staging"
  mkdir -p "$staging"
  cp -a "$nested/." "$staging/"
  find "$ROOT" -mindepth 1 -maxdepth 1 ! -name '.env' -exec rm -rf {} +
  shopt -s dotglob nullglob
  mv "$staging"/* "$ROOT/"
  shopt -u dotglob nullglob
  rmdir "$staging" 2>/dev/null || true
  restore_backend_secrets
}

cleanup_flat_deploy_root() {
  if [ ! -f "$ROOT/package.json" ] || [ ! -d "$ROOT/server/backend" ]; then
    return 0
  fi
  if [ -d "$ROOT/changmen" ] && [ ! -f "$ROOT/changmen/package.json" ]; then
    echo "==> remove leftover $ROOT/changmen"
    preserve_backend_secrets
    rm -rf "$ROOT/changmen"
    restore_backend_secrets
  fi
  rm -rf "$ROOT/.git" "$ROOT/A8" "$ROOT/BAT" "$ROOT/pingtai_offical" 2>/dev/null || true
}

flatten_legacy_nested_repo
preserve_backend_secrets

if [ "${FLATTEN_ONLY:-0}" = "1" ]; then
  cleanup_flat_deploy_root
  restore_backend_secrets
  echo "==> flatten-only done at $ROOT"
  exit 0
fi

tar -tzf "$ARCHIVE" >/dev/null

OLD_HEAD=""
if [ -d "$ROOT/.git" ]; then
  OLD_HEAD="$(git -C "$ROOT" rev-parse HEAD 2>/dev/null || true)"
fi

echo "==> extract app archive -> $ROOT (keep .env + storage)"
mkdir -p "$ROOT"
tar --warning=no-unknown-keyword -xzf "$ARCHIVE" -C "$ROOT" \
  --exclude='./server/backend/.env' \
  --exclude='./server/backend/storage'

restore_backend_secrets
cleanup_flat_deploy_root

NEW_HEAD=""
if [ -d "$ROOT/.git" ]; then
  NEW_HEAD="$(git -C "$ROOT" rev-parse HEAD 2>/dev/null || true)"
fi

export DEPLOY_SKIP_GIT_PULL=1
export DEPLOY_OLD_HEAD="${OLD_HEAD:-$NEW_HEAD}"
export DEPLOY_NEW_HEAD="${NEW_HEAD:-$OLD_HEAD}"
export DEPLOY_SKIP_APP_BUILD="${DEPLOY_SKIP_APP_BUILD:-1}"
export DEPLOY_FULL="${DEPLOY_FULL:-0}"

SCRIPT_DIR="${CHANGMEN_DEPLOY_SCRIPTS:-}"
if [ -z "$SCRIPT_DIR" ] || [ ! -f "$SCRIPT_DIR/deploy-server-remote.sh" ]; then
  if [ -f "$ROOT/deploy/ecosystem.config.cjs" ]; then
    SCRIPT_DIR="${CHANGMEN_DEPLOY_SCRIPTS:-/tmp/changmen-deploy}"
  else
    SCRIPT_DIR="$ROOT/deploy/scripts"
  fi
fi
DEPLOY_REMOTE="$SCRIPT_DIR/deploy-server-remote.sh"
if [ ! -f "$DEPLOY_REMOTE" ]; then
  echo "ERROR: missing deploy-server-remote.sh (CHANGMEN_DEPLOY_SCRIPTS=$CHANGMEN_DEPLOY_SCRIPTS)"
  exit 1
fi

echo "==> deploy ${DEPLOY_OLD_HEAD:0:8}..${DEPLOY_NEW_HEAD:0:8} (archive sync)"
bash "$DEPLOY_REMOTE"
rm -f "$ARCHIVE"
