# VPS 部署配置

生产 VPS 的 Caddy、PM2、部署/迁移脚本。应用代码与本目录同在仓库根。

## 目录

| 路径 | 说明 |
|------|------|
| [`Caddyfile`](Caddyfile) | Caddy :80 反代 + 静态 dist |
| [`ecosystem.config.cjs`](ecosystem.config.cjs) | PM2：`changmen-web`、`changmen-pm-sports` |
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
| 香港 | `47.82.100.166` | push `master` → GHA；或 `BAT\deploy-hongkong.bat` |

VPS 运行目录：`/root/changmen`（扁平，无 git）。

**VPS 上 PM2：**

```bash
cd /root/changmen
pm2 start deploy/ecosystem.config.cjs
pm2 save
```

详见 [`PRODUCTION_DEPLOYMENT.md`](../PRODUCTION_DEPLOYMENT.md)。
