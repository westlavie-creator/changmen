# One-shot: paste entire file into Aliyun ECS Workbench (root shell).
sudo tee /etc/caddy/Caddyfile >/dev/null <<'EOF'
# changmen — HTTP 反代到本机 Node (PM2 gamebet-web)
:80 {
	reverse_proxy 127.0.0.1:3456
}
EOF
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
pm2 status || true
curl -s -o /dev/null -w "node_3456=%{http_code}\n" http://127.0.0.1:3456/
curl -s -o /dev/null -w "caddy_80=%{http_code}\n" http://127.0.0.1/
echo "Open http://47.82.100.166/ (changmen login, not Caddy welcome)"
