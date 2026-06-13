# 启动与运维脚本

Windows 批处理在 [`../BAT/`](../BAT/README.md)。在 `changmen/` 目录下执行，例如 `BAT\dev.bat`。

文档总索引：[docs/README.md](../docs/README.md)。

## 架构（2026-06）

| 组件 | 入口 | 职责 |
|------|------|------|
| **Web 后端** | `BAT\backend.bat` → `npm run web` → `server.js` | HTTP `/esport/*`、静态 `/`、WS relay |
| **Vite 前端** | `BAT\dev-vite.bat` | 开发时 `5174/`，API 经 proxy 到后端 |
| **Chrome 插件** | `apps/chrome-extension` | PB/Stake 代发、凭证采集、v4 桥接 |
| **Matcher** | `npm run matcher:loop` | 合并 `client_matches` |

`apps/web` 已纳入 npm workspaces；根目录 `npm install` 会安装前端依赖，无需单独 `app:install`（该命令现为 `npm install` 别名）。

不要同时起两套 `npm run web`（Windows 默认均占 **3560**）。

## 日常开发

| 脚本 | 作用 |
|------|------|
| **`BAT\dev.bat`** | backend + Vite（推荐） |
| **`BAT\dev-web.bat`** / **`BAT\dev_web.bat`** | 同 `dev.bat`（别名） |
| **`BAT\setup-dev-env.bat`** | 首次：从 `.env.example` 复制 `apps/backend/.env` |
| **`BAT\backend.bat`** | 仅 Web 后端（`npm run web`） |
| **`BAT\parity-dev.bat`** | A8 parity：Web 后端 + Vite + matcher |
| **`BAT\dev-vite.bat`** | 仅 Vite（由上述 bat 内部调用） |

开发前在 Chrome 加载 `apps/chrome-extension`（扩展 ID `mogfpjihgoghabicofkbcmcidlcoofee`）。

Matcher 人工面板：

| 方式 | 命令 |
|------|------|
| **`BAT\matcher-ui.bat`** | 双击 / 命令行启动 |
| `npm run matcher:ui` | 同上（在 `changmen/` 下） |

→ http://localhost:3456/matcher/（主站集成）或 http://localhost:4567（`matcher:ui` 独立）

## `changmen/scripts/`（仓库级）

| 脚本 | 作用 |
|------|------|
| **`deploy-server-remote.sh`** | VPS 增量部署（由 `BAT\deploy-server.bat` 管道调用） |
| **`fix-im-stored-data.mjs`** | 修复 IM 历史存储（见 `apps/web/docs/platforms/IM.md`） |

## `apps/backend/scripts/`（后端运维）

在 `changmen/apps/backend` 下执行，或 `node scripts/<name>`。

| 脚本 | 作用 |
|------|------|
| **`start-db.mjs`** | 按 `GAMEBET_DB_SCRIPT` 启动 `server.js`（`npm run web` 入口，默认 rds） |
| **`start-rds.mjs`** | 强制 `GAMEBET_DB_SCRIPT=rds` 后启动 |
| **`apply-rds-schema.mjs`** | 应用 RDS SQL 迁移 |
| **`prune-stale.mjs`** | 本地手动 prune（生产由 matcher 每小时执行） |
| **`preweb.js`** | `npm run web` 前：构建检查 / legacy 准备 |
| **`check-collect-platforms.js`** | `npm run check:collect` — 凭证与采集器对齐审计 |
| **`account_cli.js`** | 场馆账号 CLI（`account:import-platform` 等） |
| **`create-user.js`** | 创建 RDS/JWT 用户（`users` + `profiles`） |
| **`sync-a8-esport2-assets.mjs`** | 同步 A8 esport2 静态资源到 `public/` |

## 兼容别名

| 旧名 | 现用 |
|------|------|
| `changmen/dev.bat`（根目录，已移除） | → `BAT\dev.bat` |
| `gamebet_backend/start-web.bat`（已移除） | → `BAT\backend.bat` |
| `gamebet_backend/` 目录（已移除） | → `apps/backend/` |
| `npm run app:install`（单独装 web） | → 根目录 `npm install`（workspaces 含 `apps/web`） |

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
| **`ecosystem.config.cjs`** | PM2：`gamebet-web` + `gamebet-matcher`（`cd changmen && pm2 start ecosystem.config.cjs`） |
| **`BAT\push-git.bat`** | 本机 git commit + push 到 GitHub |
| **`BAT\deploy-server.bat`** | 更新 VPS（增量部署；可本机构建前端后上传） |
| **`BAT\pack-chromeplug.bat`** | 打包 Chrome 插件 zip → `dist/` |

日常顺序：`BAT\push-git.bat` → `BAT\deploy-server.bat`

`BAT\deploy-server.local.bat`（从 `BAT\deploy-server.local.bat.example` 复制）可选加速：

| 变量 | 作用 |
|------|------|
| `DEPLOY_LOCAL_BUILD=1` | **推荐** 本机 `app:build`，上传 `dist/`，VPS 跳过 vite（最快） |
| `DEPLOY_FULL=1` | 强制全量 install + build |

仅改 matcher/backend 时，增量部署会自动跳过 `app:build`（约 10 秒级）。

生产部署：[../PRODUCTION_DEPLOYMENT.md](../PRODUCTION_DEPLOYMENT.md)

## URL

- Vite 开发：`http://localhost:5174/`（前端 dev server，API proxy → 后端）
- 服务端 API：`http://localhost:3560/esport/*`（Windows，`BAT\backend.bat` 或 `BAT\dev.bat` 已启动）

架构说明见 [readme.md](../readme.md)、[docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)。
