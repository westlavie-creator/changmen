#!/usr/bin/env bash
# Piped from deploy-server.bat (bash -s) or run on VPS after git pull.
set -euo pipefail

ROOT="${DEPLOY_REPO:?DEPLOY_REPO is required}"
PM2_WEB="${PM2_WEB:-gamebet-web}"
PM2_MATCHER="${PM2_MATCHER:-gamebet-matcher}"
DEPLOY_FULL="${DEPLOY_FULL:-0}"
DEPLOY_SKIP_APP_BUILD="${DEPLOY_SKIP_APP_BUILD:-0}"

t0=$SECONDS
log() { echo "==> $*"; }
elapsed() { echo "==> done in $((SECONDS - t0))s total"; }

if [ -f "$ROOT/changmen/package.json" ]; then
  GIT_ROOT="$ROOT"
  CHANGMEN="$ROOT/changmen"
elif [ -f "$ROOT/package.json" ] && [ -d "$ROOT/gamebet_backend" ]; then
  GIT_ROOT="$ROOT"
  CHANGMEN="$ROOT"
else
  echo "ERROR: changmen not found under DEPLOY_REPO=$ROOT"
  exit 1
fi

log "git root: $GIT_ROOT"
log "changmen: $CHANGMEN"

cd "$GIT_ROOT"
if [ ! -d .git ]; then
  echo "ERROR: $GIT_ROOT is not a git repo."
  exit 1
fi

discard_deploy_drift() {
  local p
  for p in changmen/package-lock.json package-lock.json; do
    if [ -e "$p" ] && ! git diff --quiet -- "$p" 2>/dev/null; then
      log "discard local drift: $p"
      git checkout -- "$p" 2>/dev/null || git restore -- "$p" 2>/dev/null || true
    fi
  done
}

pull_repo() {
  discard_deploy_drift
  if git pull --ff-only; then
    return 0
  fi
  log "git pull failed, fetch and reset to origin (VPS should match remote)"
  local branch
  branch="$(git rev-parse --abbrev-ref HEAD)"
  git fetch origin
  git reset --hard "origin/${branch}"
}

OLD_HEAD="$(git rev-parse HEAD)"
pull_repo
NEW_HEAD="$(git rev-parse HEAD)"

DO_INSTALL_ROOT=0
DO_INSTALL_BACKEND=0
DO_INSTALL_MATCHER=0
DO_INSTALL_FRONTEND=0
DO_APP_BUILD=0
DO_PM2_WEB=0
DO_PM2_MATCHER=0

classify() {
  local raw="$1"
  local p="${raw#changmen/}"

  case "$p" in
    package.json|package-lock.json|shared/*)
      DO_INSTALL_ROOT=1
      DO_INSTALL_BACKEND=1
      DO_PM2_WEB=1
      DO_PM2_MATCHER=1
      ;;
    gamebet_backend/*)
      DO_INSTALL_BACKEND=1
      DO_PM2_WEB=1
      ;;
    gamebet_matcher/*)
      DO_INSTALL_MATCHER=1
      DO_PM2_MATCHER=1
      ;;
    gamebet_frontend/*)
      DO_INSTALL_FRONTEND=1
      DO_APP_BUILD=1
      DO_PM2_WEB=1
      ;;
    gamebet_chromeplug/*|pack-chromeplug.bat|deploy-server.bat|deploy-server.env.example|scripts/deploy-server-remote.sh|scripts/README.md|PRODUCTION_DEPLOYMENT.md)
      ;;
    *.md|.gitignore)
      ;;
    *)
      log "unknown change: $raw (running full deploy for safety)"
      DO_INSTALL_ROOT=1
      DO_INSTALL_BACKEND=1
      DO_INSTALL_MATCHER=1
      DO_INSTALL_FRONTEND=1
      DO_APP_BUILD=1
      DO_PM2_WEB=1
      DO_PM2_MATCHER=1
      ;;
  esac
}

if [ "$DEPLOY_FULL" = "1" ]; then
  DO_INSTALL_ROOT=1
  DO_INSTALL_BACKEND=1
  DO_INSTALL_MATCHER=1
  DO_INSTALL_FRONTEND=1
  DO_APP_BUILD=1
  DO_PM2_WEB=1
  DO_PM2_MATCHER=1
elif [ "$OLD_HEAD" = "$NEW_HEAD" ]; then
  log "already up to date, skip install/build"
else
  while IFS= read -r path; do
    [ -n "$path" ] && classify "$path"
  done < <(git diff --name-only "$OLD_HEAD" "$NEW_HEAD")
fi

if [ "$DEPLOY_SKIP_APP_BUILD" = "1" ]; then
  DO_APP_BUILD=0
  DO_PM2_WEB=1
fi

cd "$CHANGMEN"

if [ "$DO_INSTALL_ROOT" = "1" ]; then
  log "npm install (changmen workspaces)"
  npm install
fi
if [ "$DO_INSTALL_BACKEND" = "1" ]; then
  log "npm install gamebet_backend"
  npm install --prefix gamebet_backend
fi
if [ "$DO_INSTALL_MATCHER" = "1" ]; then
  log "npm install gamebet_matcher"
  npm install --prefix gamebet_matcher
fi
if [ "$DO_INSTALL_FRONTEND" = "1" ]; then
  log "npm install gamebet_frontend/app"
  npm install --prefix gamebet_frontend/app
fi

if [ "$DO_APP_BUILD" = "1" ]; then
  log "app:build (slow on VPS; set DEPLOY_LOCAL_BUILD=1 in deploy-server.env to build on PC)"
  npm run app:build
else
  log "skip app:build"
fi

if command -v pm2 >/dev/null 2>&1; then
  PM2_TARGETS=()
  [ "$DO_PM2_WEB" = "1" ] && PM2_TARGETS+=("$PM2_WEB")
  [ "$DO_PM2_MATCHER" = "1" ] && PM2_TARGETS+=("$PM2_MATCHER")
  if [ "${#PM2_TARGETS[@]}" -gt 0 ]; then
    log "pm2 restart ${PM2_TARGETS[*]}"
    pm2 restart "${PM2_TARGETS[@]}"
    pm2 status
  else
    log "skip pm2 restart"
  fi
else
  echo "WARN: pm2 not found, skip restart"
fi

log "deploy done"
elapsed
