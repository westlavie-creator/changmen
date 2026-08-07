#!/usr/bin/env bash
# Shared helpers for Ubuntu/Linux local scripts (mirror of BAT\).
# shellcheck disable=SC2034

set -euo pipefail

SH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

resolve_root() {
  local candidate
  if [[ -f "${SH_DIR}/../package.json" && -d "${SH_DIR}/../server/backend" ]]; then
    ROOT="$(cd "${SH_DIR}/.." && pwd)"
    return 0
  fi
  candidate="$(cd "${SH_DIR}/../changmen" 2>/dev/null && pwd || true)"
  if [[ -n "${candidate}" && -f "${candidate}/package.json" && -d "${candidate}/server/backend" ]]; then
    ROOT="${candidate}"
    return 0
  fi
  echo "ERROR: cannot resolve changmen repo root from ${SH_DIR}" >&2
  exit 1
}

load_nvm() {
  export NVM_DIR="${NVM_DIR:-${HOME}/.nvm}"
  if [[ -s "${NVM_DIR}/nvm.sh" ]]; then
    # shellcheck disable=SC1091
    . "${NVM_DIR}/nvm.sh"
    return 0
  fi
  # Fallback: interactive bashrc often defines nvm
  if [[ -s "${HOME}/.bashrc" ]]; then
    # shellcheck disable=SC1091
    . "${HOME}/.bashrc" >/dev/null 2>&1 || true
  fi
}

require_npm() {
  load_nvm
  if ! command -v npm >/dev/null 2>&1; then
    echo "ERROR: npm not found. Install Node (nvm) first, then reopen the terminal." >&2
    echo "       Try: export NVM_DIR=\"\$HOME/.nvm\"; . \"\$NVM_DIR/nvm.sh\"" >&2
    exit 1
  fi
}

# Detect Clash Verge mixed-port and export proxy for Node/backend outbound.
load_proxy() {
  local port candidate
  if [[ -n "${http_proxy:-}${https_proxy:-}${HTTP_PROXY:-}${HTTPS_PROXY:-}" ]]; then
    echo "[proxy] using existing http(s)_proxy env"
    return 0
  fi
  for port in 7897 7890 7891 10809; do
    if ss -ltn "( sport = :${port} )" 2>/dev/null | grep -q ":${port}"; then
      candidate="http://127.0.0.1:${port}"
      export http_proxy="${candidate}"
      export https_proxy="${candidate}"
      export HTTP_PROXY="${candidate}"
      export HTTPS_PROXY="${candidate}"
      export ALL_PROXY="${candidate}"
      export NO_PROXY="localhost,127.0.0.1,::1"
      export no_proxy="${NO_PROXY}"
      echo "[proxy] Clash detected on :${port} → ${candidate}"
      return 0
    fi
  done
  echo "[proxy] WARN: Clash/proxy not listening (tried 7897/7890). RDS/外网可能失败。" >&2
  echo "         请先打开 Clash Verge，再重新运行 ./sh/dev.sh" >&2
  return 1
}

# Linux defaults (see server.js / vite.config.ts): backend 3456, Vite 5174
BACKEND_PORT="${BACKEND_PORT:-3456}"
VITE_PORT="${VITE_PORT:-5174}"
FOOTBALL_PORT="${FOOTBALL_PORT:-3457}"

port_listening() {
  local port="$1"
  ss -ltn "( sport = :${port} )" 2>/dev/null | grep -q ":${port}"
}

# 端口占用详情：pid + cmdline。占用返回 0，空闲返回 1。
# 配合 --restart：能看出端口上是残留进程还是正常 dev 服务。
port_owner() {
  local port="$1"
  local line pid cmd
  line="$(ss -ltnp "( sport = :${port} )" 2>/dev/null | grep ":${port}" || true)"
  if [[ -z "${line}" ]]; then
    return 1
  fi
  pid="$(sed -n 's/.*pid=\([0-9]\+\).*/\1/p' <<<"${line}" | head -1)"
  if [[ -z "${pid}" ]] && command -v fuser >/dev/null 2>&1; then
    # fuser 输出格式因发行版而异：纯数字 / "port/proto:pid"，只提取数字部分
    pid="$(fuser "${port}/tcp" 2>/dev/null | grep -oE '[0-9]+' | head -1 || true)"
  fi
  echo "  :${port}  pid=${pid:-unknown}"
  if [[ -n "${pid}" && -r "/proc/${pid}/cmdline" ]]; then
    cmd="$(tr '\0' ' ' <"/proc/${pid}/cmdline" 2>/dev/null || true)"
    echo "      ${cmd}"
  fi
  return 0
}

kill_port() {
  local port="$1"
  if command -v fuser >/dev/null 2>&1; then
    fuser -k "${port}/tcp" >/dev/null 2>&1 || true
  else
    local pids
    pids="$(ss -ltnp "( sport = :${port} )" 2>/dev/null | sed -n 's/.*pid=\([0-9]\+\).*/\1/p' | sort -u || true)"
    if [[ -n "${pids}" ]]; then
      # shellcheck disable=SC2086
      kill -9 ${pids} >/dev/null 2>&1 || true
    fi
  fi
}

wait_port() {
  local port="$1"
  local label="${2:-service}"
  local seconds="${3:-60}"
  local i=0
  local logfile="${LOG_DIR}/${label}.log"
  local last_line_count=0
  echo "Waiting for ${label} on port ${port} ..."
  echo "  (首次启动需加载 RDS/队伍表，约 5~40s，请勿 Ctrl+C 或关闭本终端)"
  while (( i < seconds )); do
    if port_listening "${port}"; then
      echo "${label} is listening on ${port}."
      return 0
    fi
    # 每 5 秒显示一次日志增量，方便看到卡点而不是黑盒等待
    if (( i % 5 == 0 )) && [[ -f "${logfile}" ]]; then
      local line_count
      line_count="$(wc -l <"${logfile}" 2>/dev/null || echo 0)"
      if (( line_count > last_line_count )); then
        echo "--- ${label} 日志增量 ---"
        tail -n $((line_count - last_line_count)) "${logfile}" 2>/dev/null | tail -8 | sed 's/^/  | /'
        last_line_count="${line_count}"
      fi
    fi
    i=$((i + 1))
    sleep 1
  done
  echo "WARN: ${label} not listening after ~${seconds}s" >&2
  if [[ -f "${logfile}" ]]; then
    echo "--- ${label} 日志尾部 ---" >&2
    tail -30 "${logfile}" 2>/dev/null | sed 's/^/  | /' >&2
  fi
  if port_listening "${port}"; then
    echo "NOTE: ${label} 虽已监听但超过预期时间，当前占用者：" >&2
    port_owner "${port}" >&2 || true
  fi
  return 1
}

LOG_DIR="${LOG_DIR:-/tmp/changmen-dev}"

# Always-reliable background start with logs.
# Set CHANGMEN_USE_TERM=1 to try opening a GUI terminal (often fails from Cursor).
run_in_term() {
  local title="$1"
  shift
  local cmd="$*"
  local safe="${title//[^A-Za-z0-9_-]/_}"
  local log="${LOG_DIR}/${safe}.log"
  mkdir -p "${LOG_DIR}"
  if [[ ! -w "${LOG_DIR}" ]]; then
    echo "ERROR: 日志目录不可写: ${LOG_DIR}" >&2
    echo "       它可能是 root 用户创建的残留目录。执行: sudo rm -rf ${LOG_DIR}" >&2
    exit 1
  fi

  if [[ "${CHANGMEN_USE_TERM:-0}" == "1" && -n "${DISPLAY:-}" ]]; then
    if command -v gnome-terminal >/dev/null 2>&1; then
      if gnome-terminal --title="${title}" -- bash -lc "${cmd}; echo; echo '[exit] press Enter'; read -r" 2>/tmp/changmen-dev/term.err; then
        echo "Started '${title}' in gnome-terminal"
        return 0
      fi
      echo "WARN: gnome-terminal failed ($(tr '\n' ' ' </tmp/changmen-dev/term.err 2>/dev/null)); falling back to background" >&2
    elif command -v x-terminal-emulator >/dev/null 2>&1; then
      if x-terminal-emulator -T "${title}" -e bash -lc "${cmd}; echo; echo '[exit] press Enter'; read -r" 2>/tmp/changmen-dev/term.err; then
        echo "Started '${title}' in x-terminal-emulator"
        return 0
      fi
      echo "WARN: x-terminal-emulator failed; falling back to background" >&2
    fi
  fi

  # Wrap with nvm + proxy so background jobs always find node/npm and can reach RDS/CDN
  # setsid：完全脱离当前终端会话，dev.sh 退出 / Ctrl+C / 关闭终端都不会 SIGHUP 到后台服务。
  # 内层 bash 写 pid：setsid 在交互终端下会 fork，外层 $! 是立刻退出的父进程，写 pidfile 会落空。
  local wrapper="
    export NVM_DIR=\"\${NVM_DIR:-\$HOME/.nvm}\"
    [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"
    export http_proxy='${http_proxy:-}' https_proxy='${https_proxy:-}'
    export HTTP_PROXY='${HTTP_PROXY:-}' HTTPS_PROXY='${HTTPS_PROXY:-}' ALL_PROXY='${ALL_PROXY:-}'
    export NO_PROXY='${NO_PROXY:-localhost,127.0.0.1,::1}' no_proxy=\"\$NO_PROXY\"
    echo \$\$ > '${LOG_DIR}/${safe}.pid'
    ${cmd}
  "
  if command -v setsid >/dev/null 2>&1; then
    setsid bash -lc "${wrapper}" >"${log}" 2>&1 &
  else
    nohup bash -lc "${wrapper}" >"${log}" 2>&1 &
  fi
  local pid=$!
  echo "${pid}" >"${LOG_DIR}/${safe}.pid"
  disown "${pid}" 2>/dev/null || true
  echo "Started '${title}' pid=${pid}  log=${log}"
}

open_browser() {
  local url="$1"
  if [[ -z "${DISPLAY:-}" ]]; then
    return 0
  fi
  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "${url}" >/dev/null 2>&1 || true
  elif command -v gio >/dev/null 2>&1; then
    gio open "${url}" >/dev/null 2>&1 || true
  fi
}

http_ok() {
  local url="$1"
  if command -v wget >/dev/null 2>&1; then
    wget -q --spider --timeout=2 "${url}" 2>/dev/null
    return $?
  fi
  if command -v python3 >/dev/null 2>&1; then
    python3 - <<PY
import urllib.request
urllib.request.urlopen("${url}", timeout=2)
PY
    return $?
  fi
  return 1
}

load_deploy_local() {
  local local_sh="${SH_DIR}/deploy-server.local.sh"
  local env_file="${ROOT}/deploy-server.env"

  if [[ -f "${local_sh}" ]]; then
    # shellcheck disable=SC1090
    . "${local_sh}"
    return 0
  fi

  # Bootstrap from deploy-server.env if it uses KEY=VALUE lines (or bat-style set "K=V")
  if [[ -f "${env_file}" ]]; then
    echo "[deploy] Creating sh/deploy-server.local.sh from deploy-server.env"
    {
      echo "#!/usr/bin/env bash"
      echo "# Auto-generated from deploy-server.env — edit as needed"
      sed -E \
        -e 's/\r$//' \
        -e 's/^[[:space:]]*set[[:space:]]+"([^=]+)=([^"]*)".*/\1="\2"/' \
        -e 's/^[[:space:]]*set[[:space:]]+([^=]+)=(.*)/\1="\2"/' \
        -e '/^[[:space:]]*(#|$)/!s/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/\1=\2/' \
        "${env_file}" | grep -E '^[A-Za-z_][A-Za-z0-9_]*=' || true
    } >"${local_sh}"
    chmod +x "${local_sh}"
    # shellcheck disable=SC1090
    . "${local_sh}"
  fi
}

ssh_opts() {
  SSH_OPTS=(
    -o ServerAliveInterval=30
    -o ServerAliveCountMax=8
    -o ConnectTimeout=60
    -o BatchMode=yes
  )
  if [[ -n "${SSH_IDENTITY:-}" && -f "${SSH_IDENTITY}" ]]; then
    SSH_OPTS=(-i "${SSH_IDENTITY}" -o IdentitiesOnly=yes "${SSH_OPTS[@]}")
  fi
}
