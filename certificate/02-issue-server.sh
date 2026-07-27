#!/usr/bin/env bash
# 为公网 IP 签发 HTTPS 服务端证书（无域名）
# 用法：bash 02-issue-server.sh <公网IP> [天数=825]
# 例：  bash 02-issue-server.sh 47.57.10.202
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
CONF="$ROOT/openssl.cnf"
OUT="$ROOT/out"
CA="$OUT/ca"
SERVER="$OUT/server"

IP="${1:-}"
DAYS="${2:-825}"

if [[ -z "$IP" ]]; then
  echo "用法: bash 02-issue-server.sh <公网IP> [天数]"
  echo "例:   bash 02-issue-server.sh 47.57.10.202"
  exit 1
fi

if [[ ! -f "$CA/ca.crt" || ! -f "$CA/private/ca.key" ]]; then
  echo "ERROR: 请先运行 bash 01-init-ca.sh"
  exit 1
fi

mkdir -p "$SERVER"
KEY="$SERVER/server.key"
CSR="$SERVER/server.csr"
CRT="$SERVER/server.crt"
EXT="$SERVER/server.ext"

if [[ -f "$CRT" ]]; then
  echo "ERROR: 已存在 $CRT — 换 IP 或先备份删除后再签。"
  exit 1
fi

openssl genrsa -out "$KEY" 2048
chmod 600 "$KEY"
openssl req -new -key "$KEY" -subj "/CN=$IP" -out "$CSR"

cat > "$EXT" <<EOF
basicConstraints = CA:FALSE
keyUsage = critical, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid,issuer
subjectAltName = IP:$IP
EOF

# 用 ca 签发并写入 index（与吊销流程一致）；-extfile 覆盖扩展（含 SAN）
openssl ca -config "$CONF" -notext -batch \
  -in "$CSR" -out "$CRT" \
  -days "$DAYS" -extfile "$EXT"

rm -f "$CSR" "$EXT"

echo
echo "OK 服务端证（SAN=IP:$IP）："
echo "  $CRT"
echo "  $KEY"
echo
echo "下一步：bash 03-issue-client.sh <用户名>"
echo "上传提示：bash 05-print-upload-cmds.sh $IP"
