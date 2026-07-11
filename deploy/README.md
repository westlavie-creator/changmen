# VPS 部署配置

生产 VPS 的 Caddy、PM2、部署/迁移脚本。应用代码与本目录同在仓库根。

## 目录

| 路径 | 说明 |
|------|------|
| [`Caddyfile`](Caddyfile) | Caddy :80 反代 + 静态 dist |
| [`ecosystem.config.cjs`](ecosystem.config.cjs) | PM2：`changmen-esport`（电竞）、`changmen-pm-sports`、`changmen-football`（足球） |
| [`env/`](env/) | 后端 `.env` 模板（运行时：`server/backend/.env`） |
| [`scripts/apply-repo-archive.sh`](scripts/apply-repo-archive.sh) | tarball 解压 + 扁平化 + 部署 |
| [`scripts/deploy-server-remote.sh`](scripts/deploy-server-remote.sh) | 增量 npm install / PM2 |
| [`scripts/flatten-hk-vps.sh`](scripts/flatten-hk-vps.sh) | 香港一次性扁平迁移 |
| [`scripts/migrate-server-remote.sh`](scripts/migrate-server-remote.sh) | 新机迁移 |
| [`scripts/setup-caddy-remote.sh`](scripts/setup-caddy-remote.sh) | 安装 Caddyfile |

## 双机部署

| 区域 | IP | 方式 |
|------|-----|------|
| 上海 | `106.14.82.50` | 本机 `BAT\deploy-shanghai.bat`（不进 GitHub） |
| 香港 | `47.82.100.166` | **push `master` → GHA**（推荐）；`BAT\deploy-hongkong.bat` 仅紧急备用 |

VPS 运行目录：`/root/changmen`（扁平，无 git）。

**VPS 上 PM2：**

```bash
cd /root/changmen
pm2 start deploy/ecosystem.config.cjs
pm2 save
```

详见 [`PRODUCTION_DEPLOYMENT.md`](../PRODUCTION_DEPLOYMENT.md)。

## PM HK 出口（Polymarket 服务端代连）

用户在前端 **扩展 → PM HK出口** 开启后，PM HTTP/WS 经 changmen VPS 出海。部署 HK 机时需：

```bash
# 1. 写入 http-relay 白名单并重启 backend
bash deploy/scripts/sync-pm-hk-relay-env-remote.sh

# 2. 探针（VPS 上，backend 已运行）
cd server/backend && node scripts/probe-pm-hk-relay.mjs
# 或 npm run probe:pm-hk-relay
```

`HTTP_RELAY_ALLOWED_HOSTS` 默认含 `gamma-api.polymarket.com,clob.polymarket.com,api.predict.fun,api-testnet.predict.fun`。探针失败时检查 VPS 能否 `curl -I https://clob.polymarket.com/time` 与 `curl -I https://api-testnet.predict.fun/v1/tags`。
