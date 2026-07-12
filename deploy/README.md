# VPS 部署配置

生产 VPS 的 Caddy、PM2、部署/迁移脚本。应用代码与本目录同在仓库根。

## 目录

| 路径 | 说明 |
|------|------|
| [`Caddyfile`](Caddyfile) | Caddy :80 反代 + 静态 dist |
| [`ecosystem.config.cjs`](ecosystem.config.cjs) | PM2：`changmen-esport`、`changmen-pm-sports`（**默认**）；`changmen-predictfun-collector` 可选 |
| [`env/`](env/) | 后端 `.env` 模板（运行时：`server/backend/.env`） |
| [`scripts/apply-repo-archive.sh`](scripts/apply-repo-archive.sh) | tarball 解压 + 扁平化 + 部署 |
| [`scripts/sync-git-to-flat-app.sh`](scripts/sync-git-to-flat-app.sh) | 香港：git 子目录 → 扁平 `DEPLOY_REPO` 再 deploy |
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

**VPS 上 PM2（电竞默认，仅两个进程）：**

```bash
cd /root/changmen
pm2 start deploy/ecosystem.config.cjs --only changmen-esport,changmen-pm-sports
pm2 save
```

`deploy/scripts/deploy-server-remote.sh` **只**重启 `changmen-esport` 与 `changmen-pm-sports`；若误起 `changmen-predictfun-collector` 会在部署末尾删除（除非 `DEPLOY_START_PREDICTFUN_COLLECTOR=1` 且已配 `PREDICT_FUN_API_KEY`）。

启用 Predict.fun HTTP 采集守护进程时：

```bash
pm2 start deploy/ecosystem.config.cjs --only changmen-predictfun-collector --update-env
```

详见 [`PRODUCTION_DEPLOYMENT.md`](../PRODUCTION_DEPLOYMENT.md)。

## 场馆 HK 出海 relay（http-relay / ws-forward）

用户在前端 **扩展 → HK 出海 relay** 开启后，需出海场馆 HTTP/WS 经 changmen VPS 代连：

- **Polymarket HTTP**：`Pm_HttpRequest`（VPS 直连 Gamma/CLOB，不经 `http-relay`）
- **Predict.fun HTTP**：`http-relay`
- **PM / PF WebSocket**：`ws-forward`（`PM-MARKET` / `PM-USER` / `PREDICTFUN-MARKET`）

部署 HK 机时需：

```bash
# 1. 写入 http-relay 白名单并重启 backend
bash deploy/scripts/sync-hk-relay-env-remote.sh

# 2. 探针（VPS 上，backend 已运行）
cd server/backend && node scripts/probe-hk-relay.mjs
# 或 npm run probe:hk-relay
```

`HTTP_RELAY_ALLOWED_HOSTS` 默认含 `gamma-api.polymarket.com,clob.polymarket.com,api.predict.fun,api-testnet.predict.fun`。探针失败时检查 VPS 能否 `curl -I https://clob.polymarket.com/time` 与 `curl -I https://api.predict.fun/v1/tags -H 'x-api-key: …'`。

**Predict.fun 主网**：VPS `server/backend/.env` 需 `PREDICT_FUN_API_KEY`（ws-forward 握手）；前端构建需 `VITE_PREDICT_FUN_API_KEY`（http-relay REST）。GHA 部署在 GitHub Secrets 设 `PREDICT_FUN_API_KEY`，`deploy.yml` 会注入构建与 `sync-hk-relay-env-remote.sh`。

**Predict.fun 模式 A（运营主号）**：下注私钥通过构建时 `VITE_PREDICT_FUN_PRIVY_PRIVATE_KEY` + `VITE_PREDICT_FUN_PREDICT_ACCOUNT`（或 `VITE_PREDICT_FUN_MASTER_PRIVATE_KEY`）注入；用户 changmen 账号 token 仅占位 `{ "mode": "house" }`。可选 GitHub Secrets：`PREDICT_FUN_PRIVY_PRIVATE_KEY`、`PREDICT_FUN_PREDICT_ACCOUNT`（见 `deploy.yml`）。

**PROXY 与 relay 分离：** `localStorage.PROXY` / 账号 `proxyId` 仅用于电竞**投注账号**经 http-relay 访问平台 gateway；**Predict.fun HK relay** 走当前页面同源；**Polymarket HTTP** 走 `Pm_HttpRequest`，不受 PROXY 影响。
