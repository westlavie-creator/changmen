# 启动与运维脚本

Windows 批处理在本地 `BAT\`（不进 GitHub，见 [LOCAL_DEV.md](../LOCAL_DEV.md)）。`npm run` 在**本仓库根**执行。

文档总索引：[docs/README.md](../docs/README.md)。

## 架构（2026-06）

| 组件 | 入口 | 职责 |
|------|------|------|
| **Web 后端** | `BAT\backend.bat` → `npm run web` → `server.js` | HTTP `/esport/*`、静态 `/` |
| **Vite 前端** | `npm run app:dev` 或 `BAT\dev.bat` | 开发 Vite（Win `5274` / 其它 `5174`），API proxy → 后端 |
| **Chrome 插件** | `client/chrome-extension` | PB/Stake 代发、凭证采集、v4 桥接 |
| **Matcher** | `npm run web`（内嵌）/ `npm run matcher:ui` | 合并 `client_matches` / 人工 UI |

`client/web` 已纳入 npm workspaces；根目录 `npm install` 会安装全部 workspace 依赖。

不要同时起两套 `npm run web`（Windows 默认均占 **3560**）。

## 日常开发

| 入口 | 作用 |
|------|------|
| **`BAT\dev.bat`** | backend + Vite（推荐） |
| **`BAT\dev.bat parity`** | 同上（A8 parity 验收，matchMerge 随 web 内嵌） |
| **`BAT\setup-dev-env.bat`** | 首次：从 `.env.example` 复制 `server/backend/.env` |
| **`BAT\backend.bat`** | 仅 Web 后端（`npm run web`） |
| `npm run matcher:ui` | Matcher 面板 `:4567` |
| `npm run chromeplug:pack` | 打包 Chrome 插件 zip → `dist/` |

开发前在 Chrome 加载 `client/chrome-extension`（扩展 ID `mogfpjihgoghabicofkbcmcidlcoofee`）。

Matcher 面板：http://localhost:3560/matcher/（backend 已起）或 http://localhost:4567（`matcher:ui` 独立）

## 目录

| 路径 | 用途 |
|------|------|
| [`scripts/deploy/`](deploy/) | 本机 → HK VPS：`deploy202.bat`、`deploy-hk-remaining.mjs` 等 |
| 根目录 `.mjs` | 边界检查、Telegram / Poly env 同步 |
| [`fixtures/`](fixtures/) | PM 等平台 API 响应快照（原 `tmp-*.json`） |
| [`archive/`](archive/) | 废弃的一次性仓级脚本 |
| [`../deploy/`](../deploy/) | VPS Caddy、PM2、远程 bash（**canonical**） |
| [`server/backend/scripts/`](../server/backend/scripts/README.md) | 后端运维（含 `ops/`、`archive/`） |

## 本机部署（HK）

索引：[scripts/deploy/README.md](deploy/README.md)

| 脚本 | 作用 |
|------|------|
| **`scripts\deploy\deploy202.bat`** | 本机 build + 部署 47.57.10.202 |
| `node scripts/deploy/deploy-hk-remaining.mjs <host> [--build]` | 通用 HK tarball 部署 |
| `node scripts/deploy/sync-predictfun-key-remote.mjs <host>` | 同步 Predict.fun API key |

## VPS 部署配置

见 **[`deploy/`](../deploy/README.md)**（Caddy、PM2、tarball 部署脚本）。

| 脚本 | 作用 |
|------|------|
| **`sync-telegram-env.mjs`** | `node scripts/sync-telegram-env.mjs` — Telegram env 同步到 VPS |

## `server/backend/scripts/`（后端运维）

索引：[server/backend/scripts/README.md](../server/backend/scripts/README.md)

| 子目录 | 内容 |
|--------|------|
| 根目录 | `npm run web`、`db:apply`、`account:*`、`check:collect` 等 |
| `ops/incidents/` | 一次性事故修复 |
| `ops/diagnostics/` | `diag-*`、`mem_diag_*` |
| `ops/migrations/` | `db:migrate-*`、账号回填、迁移审计 |
| `archive/` | `_tmp` / `_probe` 等已归档临时脚本 |

在 `server/backend` 下执行，或 `node scripts/<path>`。

## 兼容别名

| 旧名 | 现用 |
|------|------|
| `gamebet/changmen/` 嵌套 | 本仓库根即应用 |
| `vps/` | 已删除；脚本在 `deploy/scripts/` |

## 环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `A8_AUTH` | `0`（`BAT\backend.bat`） | 影响 A8 v4 等集成 |
| `SKIP_APP_BUILD` | 未设 | `1` 跳过 `/` 构建 |
| `CHANGMEN_DB_SCRIPT` | `rds` | 固定 RDS；旧值 `supabase`/`dual` 启动时 warn 并仍走 rds |
| `JWT_SECRET` | — | 登录必填（至少 16 字符） |
| `DATABASE_URL` | — | RDS 连接（或 `DATABASE_URL_PUBLIC` / `_INTERNAL`） |

## 打包与部署

| 脚本 | 作用 |
|------|------|
| **[`deploy/ecosystem.config.cjs`](../deploy/ecosystem.config.cjs)** | PM2：默认 `changmen-esport` 内嵌 matcher |
| **`BAT\deploy-shanghai.bat`** | 更新上海 VPS（本机 tarball + 增量部署） |
| **`BAT\deploy-hongkong.bat`** | 手动更新香港 VPS（日常 GHA 自动） |
| **`BAT\push-git.bat`** | 本机 git commit + push |
| `npm run chromeplug:pack` | 打包 Chrome 插件 zip → `dist/` |

日常顺序：`BAT\push-git.bat` → `BAT\deploy-shanghai.bat`（香港随 push 由 GHA 更新）

`BAT\deploy-server.local.bat`（首次可由根目录 `deploy-server.env` 复制生成，见 `BAT\deploy-server-core.bat`）可选加速：

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
