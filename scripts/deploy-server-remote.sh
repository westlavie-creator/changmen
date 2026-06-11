#!/usr/bin/env bash
# Piped from deploy-server.bat (bash -s) or run on VPS after git pull.
set -euo pipefail

ROOT="${DEPLOY_REPO:?DEPLOY_REPO is required}"
PM2_WEB="${PM2_WEB:-gamebet-web}"
PM2_MATCHER="${PM2_MATCHER:-gamebet-matcher}"

if [ -f "$ROOT/changmen/package.json" ]; then
  GIT_ROOT="$ROOT"
  CHANGMEN="$ROOT/changmen"
elif [ -f "$ROOT/package.json" ] && [ -d "$ROOT/gamebet_backend" ]; then
  GIT_ROOT="$ROOT"
  CHANGMEN="$ROOT"
else
  echo "ERROR: changmen not found under DEPLOY_REPO=$ROOT"
  echo "Expected $ROOT/changmen or changmen files at repo root."
  echo "Fix deploy-server.env DEPLOY_REPO, or clone the repo on the server first."
  exit 1
fi

echo "==> git root: $GIT_ROOT"
echo "==> changmen: $CHANGMEN"

cd "$GIT_ROOT"
if [ ! -d .git ]; then
  echo "ERROR: $GIT_ROOT is not a git repo. Run git clone on the server first."
  exit 1
fi
git pull

cd "$CHANGMEN"
npm install
npm install --prefix gamebet_backend
npm install --prefix gamebet_matcher
npm install --prefix gamebet_frontend/app

echo "==> app:build"
npm run app:build

echo "==> pm2 restart"
if command -v pm2 >/dev/null 2>&1; then
  pm2 restart "$PM2_WEB" "$PM2_MATCHER"
  pm2 status
else
  echo "WARN: pm2 not found, skip restart"
fi

echo "==> deploy done"
