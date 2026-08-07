#!/usr/bin/env bash
# 一键启动电竞开发环境 —— 等价于 npm run dev（turbo 前台并行起 backend + Vite）。
# 用 npm run dev 而不是分拆后台启动：输出滚动、Ctrl+C 一次全部停止，不会出现
# "Waiting for backend..." 卡住 / 后台进程被连坐杀掉的问题。
#
# Usage:
#   ./sh/dev.sh               # backend + Vite 前台启动
#   ./sh/dev.sh football      # 转调 dev-football.sh
set -euo pipefail
# shellcheck disable=SC1091
. "$(cd "$(dirname "$0")" && pwd)/_common.sh"
resolve_root
require_npm
load_proxy || true

if [[ "${1:-}" == "football" ]]; then
  exec "${SH_DIR}/dev-football.sh"
fi

echo
echo "========================================"
echo "  changmen Dev (npm run dev = turbo)"
echo "========================================"
echo "  Backend : http://localhost:${BACKEND_PORT}/"
echo "  Vite    : http://localhost:${VITE_PORT}/   ← 请打开这个（不是 5274）"
echo "  Chrome  : load chrome-extension/"
echo "  输出    : 前台滚动，Ctrl+C 一次全部停止"
echo "  环境    : A8_AUTH=0（本地 users.json） + SKIP_APP_BUILD=1（跳过每次全量构建）"
echo

cd "${ROOT}"
# 与 dev-esport.sh 对齐：本地认证走 users.json、跳过 preweb 全量 app:build、端口显式化
export PORT="${PORT:-${BACKEND_PORT}}"
export VITE_DEV_PORT="${VITE_DEV_PORT:-${VITE_PORT}}"
export A8_AUTH=0
export SKIP_APP_BUILD=1
exec npm run dev
