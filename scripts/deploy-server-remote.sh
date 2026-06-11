#!/usr/bin/env bash
# 在 VPS 上执行：git pull → 安装依赖 → 构建前端 → 重启 pm2
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHANGMEN="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO="$(cd "$CHANGMEN/.." && pwd)"

PM2_WEB="${PM2_WEB:-gamebet-web}"
PM2_MATCHER="${PM2_MATCHER:-gamebet-matcher}"

echo "==> repo:    $REPO"
echo "==> changmen: $CHANGMEN"

cd "$REPO"
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
