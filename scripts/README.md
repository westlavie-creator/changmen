# 启动与运维脚本

Windows 批处理在 [`../../BAT/`](../../BAT/README.md)。在仓库根目录 `gamebet/` 下执行，例如 `BAT\dev.bat`（`npm run` 仍在 `changmen/`）。

文档总索引：[docs/README.md](../docs/README.md)。

## 架构（2026-06）

| 组件 | 入口 | 职责 |
|------|------|------|
| **Web 后端** | `BAT\backend.bat` → `npm run web` → `server.js` | HTTP `/esport/*`、静态 `/` |
| **Vite 前端** | `npm run app:dev` 或 `BAT\dev.bat` | 开发 Vite（Win `5274` / 其它 `5174`），API proxy → 后端 |
| **Chrome 插件** | `client/chrome-extension` | PB/Stake 代发、凭证采集、v4 桥接 |
| **Matcher** | `npm run matcher:loop` | 合并 `client_matches` |

`client/web` 已纳入 npm workspaces；根目录 `npm install` 会安装全部 workspace 依赖。

不要同时起两套 `npm run web`（Windows 默认均占 **3560**）。

## 日常开发

| 入口 | 作用 |
|------|------|
| **`BAT\dev.bat`** | backend + Vite（推荐） |
| **`BAT\dev.bat parity`** | 同上 + `matcher:loop`（原 parity-dev） |
| **`BAT\setup-dev-env.bat`** | 首次：从 `.env.example` 复制 `server/backend/.env` |
| **`BAT\backend.bat`** | 仅 Web 后端（`npm run web`） |
| `npm run matcher:loop` | 单独开 matcher 合并循环 |
| `npm run matcher:ui` | Matcher 面板 `:4567` |
| `npm run chromeplug:pack` | 打包 Chrome 插件 zip → `dist/` |

开发前在 Chrome 加载 `client/chrome-extension`（扩展 ID `mogfpjihgoghabicofkbcmcidlcoofee`）。

Matcher 面板：http://localhost:3560/matcher/（backend 已起）或 http://localhost:4567（`matcher:ui` 独立）

## `changmen/scripts/`（仓库级）

| 脚本 | 作用 |
|------|------|
| **`deploy-server-remote.sh`** | VPS 增量部署（由 `BAT\deploy-server.bat` 管道调用） |
| **`setup-caddy-remote.sh`** | VPS 配置 Caddy（见 `Caddyfile`；生产文档） |
| **`sync-telegram-env.mjs`** | `node scripts/sync-telegram-env.mjs` — Telegram env 同步 |

## `server/backend/scripts/`（后端运维）

在 `changmen/server/backend` 下执行，或 `node scripts/<name>`。

| 脚本 | 作用 |
|------|------|
| **`start-db.mjs`** | 按 `GAMEBET_DB_SCRIPT` 启动 `server.js`（`npm run web` 入口，默认 rds） |
| **`start-rds.mjs`** | 强制 `GAMEBET_DB_SCRIPT=rds` 后启动 |
| **`apply-rds-schema.mjs`** | 应用 RDS SQL 迁移 |
| **`archive-stale-client-matches.mjs`** | 本地手动 client_matches archive（生产由 matcher 每小时执行） |
| **`prune-stale.mjs`** | 已废弃别名 → `archive-stale-client-matches.mjs` |
| **`preweb.js`** | `npm run web` 前：构建检查 / legacy 准备 |
| **`check-collect-platforms.js`** | `npm run check:collect` — 凭证与采集器对齐审计 |
| **`account_cli.js`** | 场馆账号 CLI（`account:import-platform` 等） |
| **`create-user.js`** | 创建 RDS/JWT 用户（`users` + `profiles`） |
| **`sync-a8-esport2-assets.mjs`** | 同步 A8 esport2 静态资源到 `public/` |

## 兼容别名

| 旧名 | 现用 |
|------|------|
| `changmen/BAT/`（已迁至仓库根） | → `BAT\dev.bat`（在 `gamebet/` 下执行） |
| `gamebet_backend/start-web.bat`（已移除） | → `BAT\backend.bat` |
| `gamebet_backend/` 目录（已移除） | → `server/backend/` |

## 环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `A8_AUTH` | `0`（`BAT\backend.bat`） | 影响 A8 v4 等集成 |
| `SKIP_APP_BUILD` | 未设 | `1` 跳过 `/` 构建 |
| `GAMEBET_DB_SCRIPT` | `rds` | 固定 RDS；旧值 `supabase`/`dual` 启动时 warn 并仍走 rds |
| `JWT_SECRET` | — | 登录必填（至少 16 字符） |
| `DATABASE_URL` | — | RDS 连接（或 `DATABASE_URL_PUBLIC` / `_INTERNAL`） |

## 打包与部署

| 脚本 | 作用 |
|------|------|
| **`ecosystem.config.cjs`** | PM2：默认 `gamebet-web` 内嵌 matcher（回滚独立 matcher：`MATCHER_STANDALONE=1 MATCHER_EMBEDDED=0 pm2 start ecosystem.config.cjs`） |
| **`BAT\deploy-server.bat`** | 更新 VPS（增量部署；可本机构建前端后上传） |
| **`BAT\push-git.bat`** | 本机 git commit + push |
| `npm run chromeplug:pack` | 打包 Chrome 插件 zip → `dist/` |

日常顺序：`BAT\push-git.bat` → `BAT\deploy-server.bat`

`BAT\deploy-server.local.bat`（从 `BAT\deploy-server.local.bat.example` 复制）可选加速：

| 变量 | 作用 |
|------|------|
| `DEPLOY_LOCAL_BUILD=1` | **推荐** 本机 `app:build`，上传 `dist/`，VPS 跳过 vite（最快） |
| `DEPLOY_FULL=1` | 强制全量 install + build |

仅改 matcher/backend 时，增量部署会自动跳过 `app:build`（约 10 秒级）。

生产部署：[../PRODUCTION_DEPLOYMENT.md](../PRODUCTION_DEPLOYMENT.md)

## URL

- Vite 开发：`http://localhost:5274/`（Windows）或 `5174`（其它）；API proxy → backend `3560` / `3456`
- 服务端 API：`http://localhost:3560/esport/*`（Windows，`BAT\backend.bat` 或 `BAT\dev.bat` 已启动）

架构说明见 [readme.md](../readme.md)、[docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)。
