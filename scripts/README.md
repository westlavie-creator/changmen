# 启动与运维脚本

在 `changmen/` 目录下执行。

## 架构（2026-06）

| 组件 | 入口 | 职责 |
|------|------|------|
| **Web 后端** | `backend.bat` → `npm run web` → `server.js` | HTTP `/esport/*`、静态 `/`、WS relay |
| **Vite 前端** | `dev-vite.bat` | 开发时 `5174/`，API 经 proxy 到 `3456` |
| **Chrome 插件** | `gamebet_chromeplug` | PB/Stake 代发、凭证采集、v4 桥接 |
| **Matcher** | `npm run matcher:loop` | 合并 `client_matches` |

平台实时 WS（OB/RAY/IA/TF）由浏览器 **直连** 各平台；PB/Stake 跨域请求经 **Chrome 扩展**。

不要同时起两套 `npm run web`（均占 3456）。

## 日常开发

| 脚本 | 作用 |
|------|------|
| **`dev.bat`** | backend + Vite + matcher + Chrome 插件（推荐） |
| **`dev-web.bat`** | 调用 `dev.bat`（文档别名） |
| **`setup-dev-env.bat`** | 首次：从 `.env.example` 复制 `gamebet_backend/.env` |
| **`backend.bat`** | 仅 Web 后端（`npm run web`，端口 3456） |
| **`parity-dev.bat`** | A8 parity：Web 后端 + Vite + matcher |
| **`dev-vite.bat`** | 仅 Vite（由上述 bat 内部调用） |

开发前在 Chrome 加载 `gamebet_chromeplug`（扩展 ID `mogfpjihgoghabicofkbcmcidlcoofee`）。

Matcher 人工面板：

| 方式 | 命令 |
|------|------|
| **`matcher-ui.bat`** 或 **`gamebet_matcher/start.bat`** | 双击 / 命令行启动 |
| `npm run matcher:ui` | 同上（在 `changmen/` 下） |

→ http://localhost:3456/matcher/（主站集成）或 http://localhost:4567（`matcher:ui` 独立）

## `scripts/` 维护工具

| 脚本 | 作用 |
|------|------|
| **`fix-im-stored-data.mjs`** | 修复 IM 历史存储（见 `gamebet_frontend/docs/platforms/IM.md`） |

## 兼容别名

| 旧名 | 现用 |
|------|------|
| `gamebet_backend/start-web.bat` | → `backend.bat` |

## 环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `A8_AUTH` | `0`（`backend.bat`） | 影响 A8 v4 等集成；登录走 Supabase（`.env` 中 `SUPABASE_*`） |
| `SKIP_APP_BUILD` | 未设 | `1` 跳过 `/` 构建 |

## 打包与部署

| 脚本 | 作用 |
|------|------|
| **`push-git.bat`** | 本机 git commit + push 到 GitHub |
| **`deploy-server.bat`** | 更新 VPS（增量部署；可本机构建前端后上传） |
| **`pack-chromeplug.bat`** | 打包 Chrome 插件 zip → `dist/` |

日常顺序：`push-git.bat` → `deploy-server.bat`

`deploy-server.local.bat`（从 `deploy-server.local.bat.example` 复制）可选加速：

| 变量 | 作用 |
|------|------|
| `DEPLOY_LOCAL_BUILD=1` | **推荐** 本机 `app:build`，上传 `dist/`，VPS 跳过 vite（最快） |
| `DEPLOY_FULL=1` | 强制全量 install + build |

仅改 matcher/backend 时，增量部署会自动跳过 `app:build`（约 10 秒级）。

生产部署：[../PRODUCTION_DEPLOYMENT.md](../PRODUCTION_DEPLOYMENT.md)

## URL

- Vite 开发：`http://localhost:5174/`（前端 dev server，API proxy → 3456）
- 服务端 API：`http://localhost:3456/esport/*`（须 `backend.bat` 或 `dev.bat` 已启动）

架构说明见 [readme.md](../readme.md)、[gamebet_backend/README.md](../gamebet_backend/README.md)。
