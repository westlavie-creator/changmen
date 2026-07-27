#!/usr/bin/env bash
# 打印把证书传到 VPS 的命令（不执行）
# 用法：bash 05-print-upload-cmds.sh <公网IP> [ssh用户=root]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
OUT="$ROOT/out"

IP="${1:-}"
USER="${2:-root}"

if [[ -z "$IP" ]]; then
  echo "用法: bash 05-print-upload-cmds.sh <公网IP> [ssh用户]"
  echo "例:   bash 05-print-upload-cmds.sh 47.57.10.202"
  exit 1
fi

need=(
  "$OUT/ca.crt"
  "$OUT/server/server.crt"
  "$OUT/server/server.key"
  "$OUT/crl/ca.crl"
)
missing=0
for f in "${need[@]}"; do
  if [[ ! -f "$f" ]]; then
    echo "缺少: $f"
    missing=1
  fi
done
if [[ "$missing" -ne 0 ]]; then
  echo "请先跑完 01-init-ca / 02-issue-server（及至少一次 CRL）。"
  exit 1
fi

REMOTE="$USER@$IP"
echo "# --- 上传到 $REMOTE（复制执行）---"
echo "ssh $REMOTE \"mkdir -p /etc/caddy/certs && chmod 755 /etc/caddy/certs\""
echo "scp \"$OUT/ca.crt\" \"$OUT/server/server.crt\" \"$OUT/server/server.key\" \"$OUT/crl/ca.crl\" $REMOTE:/etc/caddy/certs/"
echo "ssh $REMOTE \"chmod 640 /etc/caddy/certs/*; chown root:caddy /etc/caddy/certs/* 2>/dev/null || chown root:root /etc/caddy/certs/*\""
echo
echo "# 将 certificate/Caddyfile.mtls.example 中的 IP 改成 $IP 后覆盖 /etc/caddy/Caddyfile"
echo "# 然后："
echo "ssh $REMOTE \"caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy\""
echo
echo "# 用户入口：https://$IP/"
echo "# 用户文件：out/ca.crt + out/clients/<name>.p12"
