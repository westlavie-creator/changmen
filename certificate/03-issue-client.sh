#!/usr/bin/env bash
# 签发客户端证书并导出 PKCS#12（.p12）
# 用法：bash 03-issue-client.sh <用户名> [天数=825]
# 例：  bash 03-issue-client.sh alice
# 环境变量 P12_PASSWORD=xxx 可跳过交互设密（勿写进脚本文件）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
CONF="$ROOT/openssl.cnf"
OUT="$ROOT/out"
CA="$OUT/ca"
CLIENTS="$OUT/clients"

NAME="${1:-}"
DAYS="${2:-825}"

if [[ -z "$NAME" ]]; then
  echo "用法: bash 03-issue-client.sh <用户名> [天数]"
  echo "例:   bash 03-issue-client.sh alice"
  exit 1
fi

if [[ ! "$NAME" =~ ^[A-Za-z0-9._@-]+$ ]]; then
  echo "ERROR: 用户名仅允许字母数字 . _ @ -"
  exit 1
fi

if [[ ! -f "$CA/ca.crt" || ! -f "$CA/private/ca.key" ]]; then
  echo "ERROR: 请先运行 bash 01-init-ca.sh"
  exit 1
fi

mkdir -p "$CLIENTS"
KEY="$CLIENTS/$NAME.key"
CSR="$CLIENTS/$NAME.csr"
CRT="$CLIENTS/$NAME.crt"
P12="$CLIENTS/$NAME.p12"

if [[ -f "$CRT" || -f "$P12" ]]; then
  echo "ERROR: 已存在 $NAME 的证书（$CRT / $P12）"
  echo "  换名，或先 bash 04-revoke-client.sh $NAME 后再发（吊销后请换新文件名重签）。"
  exit 1
fi

openssl genrsa -out "$KEY" 2048
chmod 600 "$KEY"
openssl req -new -key "$KEY" -subj "/CN=$NAME" -out "$CSR"

openssl ca -config "$CONF" -notext -batch \
  -in "$CSR" -out "$CRT" \
  -extensions v3_client -days "$DAYS"

EXPORT_ARGS=(-export -out "$P12" -inkey "$KEY" -in "$CRT" -certfile "$CA/ca.crt" -name "changmen-$NAME")
if [[ -n "${P12_PASSWORD:-}" ]]; then
  EXPORT_ARGS+=(-passout "pass:$P12_PASSWORD")
else
  echo "请为 $NAME.p12 设置导出密码（发给用户时一并告知）："
fi
openssl pkcs12 "${EXPORT_ARGS[@]}"

chmod 600 "$P12" "$KEY"
rm -f "$CSR"

echo
echo "OK 客户端证："
echo "  $P12         ← 发给用户（连同密码）"
echo "  $OUT/ca.crt  ← 每个用户都要装的根 CA（共用）"
echo
echo "勿把 .key / .p12 提交 git。发给用户请用加密通道。"
