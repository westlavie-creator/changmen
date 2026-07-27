#!/usr/bin/env bash
# 吊销客户端证书并刷新 CRL
# 用法：bash 04-revoke-client.sh <用户名>
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
CONF="$ROOT/openssl.cnf"
OUT="$ROOT/out"
CA="$OUT/ca"
CLIENTS="$OUT/clients"

NAME="${1:-}"
if [[ -z "$NAME" ]]; then
  echo "用法: bash 04-revoke-client.sh <用户名>"
  exit 1
fi

CRT="$CLIENTS/$NAME.crt"
if [[ ! -f "$CRT" ]]; then
  echo "ERROR: 找不到 $CRT"
  exit 1
fi

if [[ ! -f "$CA/ca.crt" ]]; then
  echo "ERROR: 请先运行 bash 01-init-ca.sh"
  exit 1
fi

openssl ca -config "$CONF" -revoke "$CRT" || {
  echo "WARN: revoke 可能已吊销过，继续生成 CRL"
}

mkdir -p "$OUT/crl"
openssl ca -config "$CONF" -gencrl -out "$OUT/crl/ca.crl"

echo
echo "OK 已吊销 $NAME，CRL："
echo "  $OUT/crl/ca.crl"
echo
echo "请上传 CRL 到 VPS 并 reload Caddy："
echo "  scp out/crl/ca.crl root@YOUR_IP:/etc/caddy/certs/ca.crl"
echo "  ssh root@YOUR_IP 'systemctl reload caddy'"
echo
echo "通知用户删除本机已导入的旧证书。"
