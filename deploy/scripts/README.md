# deploy/scripts/

在 **VPS 上**执行的 bash（tarball 解压、增量 deploy、env 合并、Caddy）。本机驱动见 [`scripts/deploy/`](../../scripts/deploy/README.md) 与 [`scripts/sync/`](../../scripts/sync/README.md)。

运行目录默认：`DEPLOY_REPO=/root/changmen`（扁平，无 `changmen/` 子目录）。

## 部署与迁移

| 脚本 | 触发方 | 说明 |
|------|--------|------|
| [`apply-repo-archive.sh`](apply-repo-archive.sh) | 本机 tarball / GHA | 解压归档 → 扁平化 → 调用 `deploy-server-remote.sh` |
| [`deploy-server-remote.sh`](deploy-server-remote.sh) | 上述 / 手动 | 增量 `npm install`、RDS 迁移、PM2 重启、`post-deploy-check` |
| [`sync-git-to-flat-app.sh`](sync-git-to-flat-app.sh) | 香港 git pull 流程 | `CHANGMEN_GIT_REPO/changmen` → 扁平 `DEPLOY_REPO` |
| [`flatten-hk-vps.sh`](flatten-hk-vps.sh) | 一次性 | 旧嵌套布局 → 扁平 `/root/changmen` |
| [`migrate-server-remote.sh`](migrate-server-remote.sh) | 新机 | 全量迁移 + deploy |

## env 同步（VPS 端）

由本机 `scripts/sync/*.mjs` 经 SSH stdin 管道调用；也可在 VPS 上手动 `bash`（需 export 变量）。

| 脚本 | 本机 driver | 写入 |
|------|-------------|------|
| [`sync-telegram-env-remote.sh`](sync-telegram-env-remote.sh) | `scripts/sync/sync-telegram-env.mjs` | `TELEGRAM_BOT_TOKEN`、`TELEGRAM_ADMIN_CHAT_ID` |
| [`sync-poly-builder-env-remote.sh`](sync-poly-builder-env-remote.sh) | `scripts/sync/sync-poly-builder-env.mjs` | `POLY_BUILDER_*` |
| [`sync-hk-relay-env-remote.sh`](sync-hk-relay-env-remote.sh) | `scripts/sync/sync-predictfun-key-remote.mjs` / `deploy-hk-remaining.mjs` / 手动 | `HTTP_RELAY_*`、`PREDICT_FUN_API_KEY` |
| [`sync-pm-hk-relay-env-remote.sh`](sync-pm-hk-relay-env-remote.sh) | 遗留 PM relay 白名单 | 见脚本内注释 |

## Caddy

| 脚本 | 说明 |
|------|------|
| [`setup-caddy-remote.sh`](setup-caddy-remote.sh) | 上传 `deploy/Caddyfile` 并 reload |
| [`setup-caddy-on-server.sh`](setup-caddy-on-server.sh) | 在 VPS 上直接安装（备用） |
| [`setup-caddy-paste-on-server.sh`](setup-caddy-paste-on-server.sh) | 粘贴式安装（备用） |

索引：[deploy/README.md](../README.md) · [PRODUCTION_DEPLOYMENT.md](../../PRODUCTION_DEPLOYMENT.md)
