# One-shot: paste entire file into VPS Workbench (root shell).
# 若仓库不在 /root/gamebet，先改下面 root 路径。
sudo tee /etc/caddy/Caddyfile >/dev/null <<'EOF'
{
	auto_https off
}

:80 {
	root * /root/gamebet/changmen/client/web/dist

	handle /esport/* {
		reverse_proxy 127.0.0.1:3456
	}
	handle /common/* {
		reverse_proxy 127.0.0.1:3456
	}
	handle /api/* {
		reverse_proxy 127.0.0.1:3456
	}
	handle /esport2/* {
		reverse_proxy 127.0.0.1:3456
	}
	handle /matcher/* {
		reverse_proxy 127.0.0.1:3456
	}
	handle /v4.0/* {
		reverse_proxy 127.0.0.1:3456
	}

	handle {
		try_files {path} /index.html
		file_server
	}
}
EOF
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
pm2 status || true
curl -s -o /dev/null -w "node_3456=%{http_code}\n" http://127.0.0.1:3456/
curl -s -o /dev/null -w "caddy_80=%{http_code}\n" http://127.0.0.1/
echo "Open http://YOUR_VPS_IP/ (changmen login)"
