#!/usr/bin/env bash
# 签发 HTTPS 服务端证书：SAN = 公网 IP + 可选域名
# 用法：bash 02-issue-server.sh <公网IP> [天数=825] [域名...]
# 例：  bash 02-issue-server.sh 47.57.10.202
# 例：  bash 02-issue-server.sh 47.57.10.202 825 changmen.fun www.changmen.fun
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
CONF="$ROOT/openssl.cnf"
OUT="$ROOT/out"
CA="$OUT/ca"
SERVER="$OUT/server"

IP="${1:-}"
DAYS=825
if [[ -n "$IP" ]]; then
  shift
fi
if [[ -n "${1:-}" && "$1" =~ ^[0-9]+$ ]]; then
  DAYS="$1"
  shift
fi
DNS_NAMES=("$@")

if [[ -z "$IP" ]]; then
  echo "用法: bash 02-issue-server.sh <公网IP> [天数] [域名...]"
  echo "例:   bash 02-issue-server.sh 47.57.10.202 825 changmen.fun www.changmen.fun"
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

if [[ -f "$CRT" || -f "$KEY" ]]; then
  stamp="$(date +%Y%m%d%H%M%S)"
  [[ -f "$CRT" ]] && mv "$CRT" "$CRT.bak-$stamp"
  [[ -f "$KEY" ]] && mv "$KEY" "$KEY.bak-$stamp"
  echo "已备份旧服务端证 → $SERVER/*.bak-$stamp"
fi

SAN="IP:$IP"
for name in "${DNS_NAMES[@]}"; do
  [[ -z "$name" ]] && continue
  SAN="$SAN,DNS:$name"
done

openssl genrsa -out "$KEY" 2048
chmod 600 "$KEY"
openssl req -new -key "$KEY" -subj "/CN=$IP" -out "$CSR"

cat > "$EXT" <<EOF
basicConstraints = CA:FALSE
keyUsage = critical, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid,issuer
subjectAltName = $SAN
EOF

# index.txt.attr 可能仍是 unique_subject=yes（旧 openssl 默认），重签同 CN 会失败
if [[ -f "$CA/index.txt.attr" ]]; then
  printf 'unique_subject = no\n' > "$CA/index.txt.attr"
fi

# 用 ca 签发并写入 index（与吊销流程一致）；-extfile 覆盖扩展（含 SAN）
openssl ca -config "$CONF" -notext -batch \
  -in "$CSR" -out "$CRT" \
  -days "$DAYS" -extfile "$EXT"

rm -f "$CSR" "$EXT"

echo
echo "OK 服务端证（SAN=$SAN）："
echo "  $CRT"
echo "  $KEY"
echo
echo "下一步：bash 03-issue-client.sh <用户名>"
echo "上传提示：bash 05-print-upload-cmds.sh $IP"
