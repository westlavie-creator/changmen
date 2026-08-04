#!/usr/bin/env bash
# changmen 证书工具菜单（Ubuntu/Linux）——对应 证书工具.bat
# 用法：bash 证书工具.sh
set -uo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

run_step() {
  local script="$1"; shift
  if [[ ! -f "$ROOT/$script" ]]; then
    echo "ERROR: 找不到 $script"
    return 1
  fi
  bash "$ROOT/$script" "$@"
}

while true; do
  clear 2>/dev/null || true
  cat <<'MENU'
========================================
  changmen certificate tool (local)
========================================
  1. Init root CA              (01-init-ca)
  2. Issue server cert         (02-issue-server)
  3. Issue client .p12         (03-issue-client)
  4. Revoke client cert        (04-revoke-client)
  5. Print upload commands     (05-print-upload-cmds)
  6. Print leaf sync commands  (06-print-leaf-sync-cmds)
  0. Exit
========================================
MENU
  read -r -p "Select: " CHOICE

  case "$CHOICE" in
    1) run_step 01-init-ca.sh ;;
    2)
      read -r -p "Server host/IP (如 47.57.10.202): " HOST
      run_step 02-issue-server.sh "$HOST"
      ;;
    3)
      read -r -p "Client name (如 alice): " NAME
      run_step 03-issue-client.sh "$NAME"
      ;;
    4)
      read -r -p "Client name to revoke (如 alice): " NAME
      run_step 04-revoke-client.sh "$NAME"
      ;;
    5)
      read -r -p "Server IP (如 47.57.10.202): " HOST
      run_step 05-print-upload-cmds.sh "$HOST"
      ;;
    6)
      read -r -p "Remote (如 root@47.57.10.202，回车用默认): " REMOTE
      if [[ -n "$REMOTE" ]]; then
        run_step 06-print-leaf-sync-cmds.sh "$REMOTE"
      else
        run_step 06-print-leaf-sync-cmds.sh
      fi
      ;;
    0) exit 0 ;;
    *) echo "Invalid option" ;;
  esac

  echo
  read -r -p "按回车返回菜单..." _
done
