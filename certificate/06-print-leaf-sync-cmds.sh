#!/usr/bin/env bash
# 打印：把当前有效客户端叶子证同步到 VPS 白名单目录的命令（不执行）
# 用法：bash 06-print-leaf-sync-cmds.sh [user@host]
# 例：  bash 06-print-leaf-sync-cmds.sh hk-57
#
# 注意：Caddy folder loader 只加载 *.pem（忽略 .crt）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
CLIENTS="$ROOT/out/clients"
REMOTE="${1:-root@YOUR_IP}"
REMOTE_DIR="/etc/caddy/certs/clients"

if [[ ! -d "$CLIENTS" ]]; then
  echo "ERROR: 找不到 $CLIENTS（先签发客户端证）"
  exit 1
fi

mapfile -t CRTS < <(find "$CLIENTS" -maxdepth 1 -type f -name '*.crt' | sort)
if [[ ${#CRTS[@]} -eq 0 ]]; then
  echo "ERROR: $CLIENTS 下没有 .crt"
  exit 1
fi

echo "# 叶子白名单同步（上传为 .pem；勿传 .key / .p12）"
echo "# 目标: $REMOTE:$REMOTE_DIR"
echo "# Caddy folder loader 只识别 *.pem"
echo
echo "ssh $REMOTE \"mkdir -p $REMOTE_DIR && chmod 755 $REMOTE_DIR\""
echo "scp \\"
for f in "${CRTS[@]}"; do
  echo "  \"$f\" \\"
done
echo "  $REMOTE:/tmp/cm-leaves/"
echo "ssh $REMOTE 'mkdir -p /tmp/cm-leaves $REMOTE_DIR"
echo "  for f in /tmp/cm-leaves/*.crt; do bn=\$(basename \"\$f\" .crt); cp \"\$f\" $REMOTE_DIR/\$bn.pem; done"
echo "  chmod 644 $REMOTE_DIR/*.pem"
echo "  chown root:caddy $REMOTE_DIR/*.pem 2>/dev/null || chown root:root $REMOTE_DIR/*.pem"
echo "  caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy'"
echo
echo "# 吊销某用户后从白名单移除（例 alice）："
echo "#   ssh $REMOTE \"rm -f $REMOTE_DIR/alice.pem && systemctl reload caddy\""
