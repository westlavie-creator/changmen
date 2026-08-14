#!/usr/bin/env bash
# Esport: backend + Vite (+ optional matcher UI with: parity|matcher)
# matchMerge 循环内嵌在 backend，无需单独启动；parity 只多起人工关联 UI。
#
# Usage:
#   ./sh/dev-esport.sh              # 本机 backend + Vite（全栈）
#   ./sh/dev-esport.sh remote       # 只起 Vite，API/hub 指 VPS（日常改 UI 推荐）
#   ./sh/dev-esport.sh parity
#   CHANGMEN_USE_TERM=1 ./sh/dev-esport.sh   # try GUI terminals
set -euo pipefail
# shellcheck disable=SC1091
. "$(cd "$(dirname "$0")" && pwd)/_common.sh"
resolve_root
require_npm
load_proxy || true

PORT="${PORT:-${BACKEND_PORT}}"
VITE="${VITE_DEV_PORT:-${VITE_PORT}}"
PARITY=0
REMOTE=0
OPEN_BROWSER=1
RESTART=0
ARGS=()
for arg in "$@"; do
  case "${arg}" in
    remote|vps) REMOTE=1 ;;
    parity|matcher) PARITY=1 ;;
    --no-open) OPEN_BROWSER=0 ;;
    --term) CHANGMEN_USE_TERM=1 ;;
    --restart) RESTART=1 ;;
    *) ARGS+=("${arg}") ;;
  esac
done
export CHANGMEN_USE_TERM="${CHANGMEN_USE_TERM:-0}"

if [[ "${REMOTE}" == "1" && "${PARITY}" == "1" ]]; then
  echo "ERROR: remote 模式不起本机 backend/matcher；去掉 parity，或改用全栈模式。" >&2
  exit 1
fi

ENV_LOCAL="${ROOT}/client/web/.env.local"
read_env_local() {
  local key="$1"
  [[ -f "${ENV_LOCAL}" ]] || return 0
  local line
  line="$(grep -E "^[[:space:]]*${key}=" "${ENV_LOCAL}" 2>/dev/null | tail -1 || true)"
  [[ -n "${line}" ]] || return 0
  printf '%s' "${line#*=}" | sed 's/^["'\'']//;s/["'\'']$//'
}

API_PROXY="$(read_env_local VITE_API_PROXY)"
TLS_CERT="$(read_env_local VITE_API_PROXY_TLS_CERT)"
TLS_KEY="$(read_env_local VITE_API_PROXY_TLS_KEY)"

echo
echo "========================================"
if [[ "${REMOTE}" == "1" ]]; then
  echo "  changmen 电竞 Dev · remote（只 Vite → VPS）"
elif [[ "${PARITY}" == "1" ]]; then
  echo "  changmen 电竞 Dev + Matcher"
else
  echo "  changmen 电竞 Dev（本机全栈）"
fi
echo "========================================"
if [[ "${REMOTE}" == "1" ]]; then
  echo "  Backend : VPS（不起本机）"
  echo "  API     : ${API_PROXY:-（未设 VITE_API_PROXY → 仍会打本机 ${PORT}！）}"
else
  echo "  Backend : http://localhost:${PORT}/"
fi
echo "  Vite    : http://localhost:${VITE}/   ← 请打开这个（不是 5274）"
echo "  Chrome  : load chrome-extension/"
if [[ "${PARITY}" == "1" ]]; then
  echo "  Matcher : http://localhost:4567/  (人工关联 UI；matchMerge 已内嵌 backend)"
fi
echo
if [[ "${REMOTE}" == "1" ]]; then
  echo "  Tip: 改 UI/适配器用 remote；改 backend/合场用全栈 + 隔离库"
  echo "       配置见 client/web/.env.local（VITE_API_PROXY + mTLS 证书）"
else
  echo "  Tip: ./sh/dev-esport.sh remote   # 只 Vite → VPS"
  echo "       ./sh/dev-esport.sh parity"
  echo "       ./sh/dev-esport.sh --restart"
fi
echo "       ./sh/status-dev.sh / ./sh/stop-dev.sh"
echo

if [[ "${REMOTE}" == "1" ]]; then
  if [[ -z "${API_PROXY}" ]]; then
    echo "ERROR: remote 模式需要 client/web/.env.local 中设置 VITE_API_PROXY（如 https://changmen.fun）" >&2
    echo "       可参考 client/web/.env.example 中「remote / VPS」一节。" >&2
    exit 1
  fi
  if [[ "${API_PROXY}" =~ ^https?://(127\.0\.0\.1|localhost)(:|/|$) ]]; then
    echo "ERROR: VITE_API_PROXY=${API_PROXY} 仍指向本机；remote 应指向 VPS。" >&2
    exit 1
  fi
  if [[ "${API_PROXY}" =~ ^https:// ]]; then
    if [[ -z "${TLS_CERT}" || -z "${TLS_KEY}" ]]; then
      echo "WARN: 未设 VITE_API_PROXY_TLS_CERT/KEY。生产 mTLS 下登录可能失败；" >&2
      echo "      证书 CN 须与登录用户名一致（见 certificate/）。" >&2
    elif [[ ! -f "${TLS_CERT}" || ! -f "${TLS_KEY}" ]]; then
      echo "WARN: TLS 证书文件不存在：${TLS_CERT} / ${TLS_KEY}" >&2
    fi
  fi
  echo "注意：API 打生产时慎用 SaveData / 试单等写操作。"
  echo
fi

# 启动一个服务：端口空闲直接起；被占用时按 --restart 决定复用还是强制重启。
start_service() {
  local title="$1" port="$2"
  shift 2
  local start_cmd="$*"

  if port_listening "${port}"; then
    if [[ "${RESTART}" == "1" ]]; then
      echo "[!] Port ${port} 被占用，--restart 强制重启："
      port_owner "${port}" || true
      kill_port "${port}"
      sleep 1
    else
      echo "Port ${port} already in use — reusing existing ${title}"
      port_owner "${port}" || true
      echo "  (若这是残留进程，先 ./sh/stop-dev.sh 或用 ./sh/dev-esport.sh --restart)"
      return 0
    fi
  fi

  echo "Starting ${title}..."
  run_in_term "${title}" "${start_cmd}"
  wait_port "${port}" "${title}" 90 || {
    echo "ERROR: ${title} failed to listen. See ${LOG_DIR}/${title}.log" >&2
    tail -30 "${LOG_DIR}/${title}.log" 2>/dev/null || true
    exit 1
  }
}

if [[ "${REMOTE}" != "1" ]]; then
  # Avoid stale listeners from a previous half-start
  start_service "backend" "${PORT}" \
    "export PORT=${PORT} A8_AUTH=0 SKIP_APP_BUILD=1; cd \"${ROOT}\" && \"${SH_DIR}/backend.sh\""
fi

start_service "vite" "${VITE}" \
  "export VITE_DEV_PORT=${VITE}; cd \"${ROOT}\" && npm run app:dev"

if [[ "${PARITY}" == "1" ]]; then
  echo "[3/3] Starting matcher UI..."
  run_in_term "matcher" "cd \"${ROOT}\" && npm run matcher:ui"
fi

echo
if http_ok "http://127.0.0.1:${VITE}/"; then
  echo "[OK] Vite is up:  http://localhost:${VITE}/"
else
  echo "[OK] Vite port open: http://localhost:${VITE}/  (HTTP check skipped/unavailable)"
fi
if [[ "${REMOTE}" == "1" ]]; then
  echo "     API (remote): ${API_PROXY}"
else
  echo "     Backend:       http://localhost:${PORT}/"
fi
echo "     Logs:          ${LOG_DIR}/"
echo "     Stop:          ./sh/stop-dev.sh"

if [[ "${OPEN_BROWSER}" == "1" ]]; then
  open_browser "http://localhost:${VITE}/"
fi
