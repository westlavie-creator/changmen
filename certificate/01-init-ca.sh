#!/usr/bin/env bash
# 初始化内部根 CA → certificate/out/ca/
# 用法：bash 01-init-ca.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
CONF="$ROOT/openssl.cnf"
OUT="$ROOT/out"
CA="$OUT/ca"

if [[ -f "$CA/ca.crt" || -f "$CA/private/ca.key" ]]; then
  echo "ERROR: CA already exists under out/ca/ — refuse to overwrite."
  echo "  若确要重建：先备份再删除 out/ 后重跑。"
  exit 1
fi

mkdir -p "$CA/private" "$CA/certs" "$CA/crl" "$CA/newcerts" "$OUT/server" "$OUT/clients" "$OUT/crl"
chmod 700 "$CA/private"
touch "$CA/index.txt"
echo "1000" > "$CA/serial"
echo "1000" > "$CA/crlnumber"

openssl genrsa -out "$CA/private/ca.key" 4096
chmod 600 "$CA/private/ca.key"

openssl req -config "$CONF" -x509 -new -nodes \
  -key "$CA/private/ca.key" -sha256 -days 3650 \
  -subj "/CN=changmen-internal-CA" \
  -extensions v3_ca \
  -out "$CA/ca.crt"

openssl ca -config "$CONF" -gencrl -out "$OUT/crl/ca.crl"
cp "$CA/ca.crt" "$OUT/ca.crt"

echo
echo "OK 根 CA 已创建："
echo "  $OUT/ca.crt          ← 发给用户「信任根」"
echo "  $CA/private/ca.key   ← 私钥，勿外传、勿提交 git"
echo
echo "下一步：bash 02-issue-server.sh 47.57.10.202"
