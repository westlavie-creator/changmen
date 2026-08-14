#!/usr/bin/env bash
# 步骤 1：启用 api.changmen.fun 双挂（页面站不变）。
# 在 VPS 上执行（由本机 sh/step1-enable-api-subdomain.sh 通过 ssh 调用）。
#
# 前置：DNS A 记录 api.changmen.fun → 本机公网 IP（与 changmen.fun 相同）
# 动作：certbot --expand 加入 api → 同步 LE 到 /etc/caddy/certs/le → 安装 Caddyfile → reload
set -euo pipefail

EXPECTED_IP="${EXPECTED_IP:-47.57.10.202}"
CADDY_SRC="${CADDY_SRC:-/root/changmen/certificate/Caddyfile.dual.example}"
CADDY_DEST="${CADDY_DEST:-/etc/caddy/Caddyfile}"
LE_LIVE="${LE_LIVE:-/etc/letsencrypt/live/changmen.fun}"
LE_CADDY="${LE_CADDY:-/etc/caddy/certs/le}"
ACME_WEBROOT="${ACME_WEBROOT:-/var/www/acme}"

log() { echo "[step1-api] $*"; }
die() { echo "[step1-api] ERROR: $*" >&2; exit 1; }

need_cmd() { command -v "$1" >/dev/null 2>&1 || die "missing command: $1"; }

need_cmd certbot
need_cmd caddy
need_cmd python3

[[ -f "$CADDY_SRC" ]] || die "missing Caddyfile template: $CADDY_SRC"
[[ -d "$LE_LIVE" ]] || die "missing LE live dir: $LE_LIVE"
mkdir -p "$ACME_WEBROOT" "$LE_CADDY"

log "check DNS api.changmen.fun → $EXPECTED_IP"
API_IP="$(python3 - <<'PY'
import json, socket, urllib.request
host = "api.changmen.fun"
# 1) 本机解析
try:
  print(socket.getaddrinfo(host, None, socket.AF_INET)[0][4][0])
  raise SystemExit
except Exception:
  pass
# 2) 公网 DNS（VPS 本地 resolver 常滞后）
for url in (
  "https://dns.google/resolve?name=api.changmen.fun&type=A",
  "https://cloudflare-dns.com/dns-query?name=api.changmen.fun&type=A",
):
  try:
    req = urllib.request.Request(url, headers={"accept": "application/dns-json"})
    data = json.load(urllib.request.urlopen(req, timeout=8))
    for ans in data.get("Answer") or []:
      if ans.get("type") == 1 and ans.get("data"):
        print(ans["data"])
        raise SystemExit
  except SystemExit:
    raise
  except Exception:
    continue
print("")
PY
)"
[[ -n "$API_IP" ]] || die "api.changmen.fun 无法解析。请先加 DNS A 记录 → $EXPECTED_IP 后再跑本脚本。"
[[ "$API_IP" == "$EXPECTED_IP" ]] || die "api.changmen.fun 解析到 $API_IP，期望 $EXPECTED_IP（防指错机）。"
log "DNS ok: api.changmen.fun → $API_IP"

log "expand Let's Encrypt SAN to include api.changmen.fun"
certbot certonly --webroot -w "$ACME_WEBROOT" \
  --cert-name changmen.fun \
  -d changmen.fun -d www.changmen.fun -d ws.changmen.fun -d api.changmen.fun \
  --expand --non-interactive --agree-tos \
  || die "certbot --expand 失败（检查 :80 ACME 与 DNS）"

log "sync LE → $LE_CADDY"
install -o root -g caddy -m 640 "$LE_LIVE/fullchain.pem" "$LE_CADDY/fullchain.pem"
install -o root -g caddy -m 640 "$LE_LIVE/privkey.pem" "$LE_CADDY/privkey.pem"

log "backup + install Caddyfile"
cp -a "$CADDY_DEST" "${CADDY_DEST}.bak.step1.$(date +%Y%m%d%H%M%S)"
cp -a "$CADDY_SRC" "$CADDY_DEST"

log "validate + reload caddy"
caddy validate --config "$CADDY_DEST"
caddy reload --config "$CADDY_DEST" || systemctl reload caddy

log "SAN check"
openssl x509 -in "$LE_CADDY/fullchain.pem" -noout -text | grep -A1 "Subject Alternative Name" || true

log "done. 验收（本机带客户端证）:"
log "  curl --cert RIVER.crt --key RIVER.key https://api.changmen.fun/health"
log "页面站未改：https://changmen.fun/ 行为应与步骤 1 前相同。"
