# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

changmen 是 **客户端 + 服务端** 系统（对标 A8 的分工），不是「单机本地工具」：

| 角色 | 组件 | 职责 |
|------|------|------|
| **客户端** | `client/web`、Chrome 插件（`client/chrome-extension`） | 连各博彩平台、采集比赛/赔率、下注；通过 `API_SaveMatch` / `API_SaveBet` 上报 |
| **服务端** | `server/backend`、`server/matcher`、RDS（PostgreSQL） | 接收上报、合并赛事（`client_matches`）、鉴权、账号/订单、HTTP 代理 |

开发时后端 `localhost:3560`（Windows）/ `3456`（其它）+ Vite `5274`（Windows）/ `5174`（其它）为本机联调地址（见 `client/web/vite.config.ts`）；生产见 [PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md)（同源 `/` + `/esport/*`）。

A8 参考：仅有 minified bundle（`../A8/A8frontendscipts/2.0.1/index.js`）。A8 官方服务端不可见。changmen 服务端 API 形状由 bundle **反推**；行为验收以 bundle / 抓包为准，不是「本地复刻版后端」。

**团队边界**：客户端 / 服务端目录与 `npm run check:boundaries` 见 [docs/TEAM_BOUNDARIES.md](./docs/TEAM_BOUNDARIES.md)。

**All commands below must be run from the `changmen/` directory unless stated otherwise.** Windows `.bat` 在仓库根目录 `BAT/`（在 `gamebet/` 下执行，例如 `BAT\dev.bat`）。

**生产部署**：[PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md)（M1 架构冻结、环境变量、双进程清单）

---

## Commands

### Install

```bat
npm install                            # workspaces：shared、backend、matcher、web、chrome-extension、packages
BAT\setup-dev-env.bat                  # 首次：从 .env.example 复制 server/backend/.env
```

（根目录 `npm install` 会 hoist 全部 workspace 依赖。）

### Start (development)

HTTP 由 `server/backend/server.js` 提供。**开发**：`BAT\dev.bat`（backend + Vite + Chrome 插件）；**生产**见 [PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md)。

```bat
BAT\dev.bat               # backend + Vite（Win: 3560+5274 / 其它: 3456+5174，推荐）
BAT\dev.bat parity        # 同上 + matcher:loop（A8 parity 验收）
BAT\setup-dev-env.bat     # 首次：复制 server/backend/.env
BAT\backend.bat           # 仅 Web 后端
npm run matcher:ui        # 可选：独立 matcher UI http://localhost:4567
```

### Build frontend

```bat
npm run app:build         # vue-tsc + vite build → client/web/dist/
```

`vite.config.ts` 在 `strict` 下参与 `vue-tsc`（仅 `app:build` 与 `predev` 的 `typecheck:node`）。**新增 Vite 插件/中间件请写到 `client/web/vite/plugins/*.ts`**，勿在 `vite.config.ts` 里写无类型 inline 函数，否则 dev 不报错、deploy 才炸。

### Tests

```bat
npm run check:boundaries   # 客户端/服务端 import 边界
npm test                    # 后端 vitest + adapter 冒烟 + 前端 typecheck + vitest
npm run test:backend
npm run typecheck:frontend  # vue-tsc -b（与 app:build 同一道闸，deploy 前可先跑）
npm run test:frontend       # typecheck:frontend && vitest
```

`vitest` 不做完整 TS 检查；**只有 `typecheck:frontend` / `app:build` 会跑 `vue-tsc -b`**。改完前端代码后至少跑其一，否则 deploy 才报错。`BAT\push-git.bat` 在 commit 前会自动跑 `typecheck:frontend`。

Frontend-only（在 `client/web/`）：

```bat
npm run test:ob           # offline: GetMatchs shape + provider contract
npm run test:ob:all       # includes live smoke (needs backend on 3560 / PORT)
npm run test:v4           # PB v4 credit-plate login E2E
```

Live smoke requires backend:
```bat
ESPORT_TEST_BASE=http://127.0.0.1:3560 npm run test:ob-live
```

### Backend one-off scripts (run from `server/backend/`)

```bat
npm run check:collect           # print all platform credential status
npm run check:collect:probe     # + probe each gateway with a live request
npm run ob:login                # fetch OB trial session and print it
npm run account:cli             # interactive account manager
npm run test:adapter            # packaged adapter layout 模拟
```

---

## Architecture

**目标 monorepo 布局与迁移进度**：见 [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)。

### Directory layout

```
changmen/
├── client/
│   ├── web/                Vue 3 + Vite (base /)
│   ├── chrome-extension/   Chrome MV3
│   └── venue-adapter/   @changmen/venue-adapter
├── server/
│   ├── backend/            Node.js ESM，port 3560 (Win) / 3456
│   ├── matcher/            matchMerge 循环 + 人工关联 Web
│   ├── db/                 @changmen/db
│   ├── match-engine/       @changmen/match-engine
│   └── team-resolver/      @changmen/team-resolver
├── devtools/
│   └── platform-probes/    @changmen/platform-probes（可选探针）
├── packages/
│   ├── shared/             @changmen/shared
│   └── api-contract/       HTTP 契约
├── docs/                   架构文档入口 ARCHITECTURE.md
└── （Windows 启动脚本在仓库根 BAT\dev.bat，parity: BAT\dev.bat parity）
```

### 代码边界（依赖方向）

| 目录 | 可 require |
|------|------------|
| `server/backend` | `packages/shared/*`、`client/venue-adapter`（`adapter_paths` / `reqS`） |
| `server/matcher` | `server/match-engine`、`packages/shared/*`、`@changmen/team-resolver` |

`Client_GetMatchs` **不**在 backend 内合并；只读 `client_matches`（由 `server/matcher` **matchMerge** 写入）。

### Backend (`server/backend/`)

**分层：**

| 层 | 目录 | 职责 |
|---|---|---|
| 入口 | `server.js`、`http_routes.js`、`proxy/` | HTTP server + HTTP 代理 |
| Core | `core/` | 业务逻辑：路由/store/账号/DB/shared utils |
| Platform | `client/venue-adapter/`（`@changmen/venue-adapter`） | 各场馆 collect/bet + registry（canonical） |

后端经 `core/shared/adapter_paths.js` 的 `requirePlatform` 加载平台模块。详见 `client/venue-adapter/README.md`。

**入口：** `node server.js` — HTTP server、HTTP 代理、esport-api

**proxy/：** 各平台 HTTP 中继（`http_proxy_relay.js`、`ob_http_proxy.js` 等）；WebSocket 由浏览器直连，不经本机网关。

| Module | Role |
|--------|------|
| `core/esport-api/router.js` | Handles all `Client_*` / `API_*` actions (match list, collect config, accounts, v4, etc.) |
| `core/esport-api/store.js` | JSON file store; esport data lives in `storage/esport/*.json` (env: `ESPORT_DATA_DIR`) |
| `core/esport-api/platform_sync.js` | Populates `platforms.json` at startup (stored JSON → trial/env login) |
| `server/db/`（`@changmen/db`） | 数据层唯一入口：RDS / PostgreSQL（`index.js` → `impl_rds.js`） |
| `core/db/store.js` | 内存缓存（`_cache`）+ RDS 异步写；账号读写的主路径 |
| `core/account/order_store.js` | 订单读写，RDS `orders` 表，无本地副本 |

Auth: 自签 JWT（`users` + `profiles`）。凭证在 `server/backend/.env`（`JWT_SECRET`、`DATABASE_URL` 或 `DATABASE_URL_PUBLIC` / `DATABASE_URL_INTERNAL`）。

**Storage split**（详见 [docs/DATA_STORAGE.md](./docs/DATA_STORAGE.md)）：

| Data | Store | Notes |
|------|-------|-------|
| 账号（ACCOUNT） | RDS `profiles.accounts` jsonb | `[changmen 实现]` 存 Client_SaveData 的 JSON 数组；非 A8 服务端结构。内存缓存见 `db/store.js` |
| 订单 | RDS `orders` 表 | 无数据库时返回空，功能不可用 |
| 用户设置（CollectConfig / USERCONFIG 等） | `db/store.js` 内存 + RDS `profiles` 异步写 | 重启后从 RDS 重载 |
| esport 数据（赛事/赔率/平台凭证等） | 本地 JSON（`storage/legacy/esport/*.json`） | 不依赖云库 |
| 平台采集凭证 | `platforms.json`（esport 数据目录） | 不依赖云库 |

Storage path resolved in `core/shared/storage_paths.js`. Override via `ESPORT_DATA_DIR` or `GAMEBET_STORAGE_DIR`. Example configs: `server/backend/a8_config.example.json`, `server/backend/platforms.example.json`.

### Frontend (`client/web/src/`)

See `ARCHITECTURE.md` in the same directory for the canonical reference. Summary:

| Directory | Role |
|-----------|------|
| `api/` | All `Client_*` HTTP calls to the backend (`client.ts` wraps token + `post()`) |
| `runtime/` | `collectors.ts` + `providers.ts` — wired at app startup; registers all adapters |
| `@venue/*` | Vite alias → `client/venue-adapter/`（canonical 采集/下注源码） |
| `client/venue-adapter/registry/adapters.ts` | `PLATFORM_ADAPTERS` + `buildCollectorFactories()` |
| `stores/` | 10 Pinia stores; `matchStore` owns the polling loop; `oddsStore` is the real-time odds cache (`fo`) |
| `shared/http.ts` | `directGet` / `directPostJson` — Axios for collect HTTP (bypasses backend proxy) |
| `shared/platformHttp.ts` | Axios for betting account HTTP (supports relay, optional SOCKS proxy) |
| `client/venue-adapter/shared/` | 采集横切：`collectSession`、`collectNotify`、`socket/`（A8 频道 IM/XBet/Stake） |

`@` alias maps to `src/`.

### 数据采集（客户端 → 服务端）

**服务端不连平台拉列表/赔率**（已删除 Node FeedHub）。采集只在客户端：

```
客户端采集器 → API_SaveMatch / API_SaveBet → 服务端 store → RDS
matcher（服务端进程）→ client_matches → Client_GetMatchs → 客户端 UI
```

启动开发栈：`BAT\dev.bat` / `BAT\backend.bat`。

### 采集层 API 命名对照

| 层级 | A8 名称 | changmen 名称 |
|---|---|---|
| `api/match.ts`（HTTP 调用） | `saveMatchSource` | `saveMatchSource` |
| `api/match.ts`（HTTP 调用） | `saveBetSource` | `saveBetSource` |
| `api/match.ts`（HTTP 调用） | `saveLiveTimer` | `saveLiveTimer` |
| `collectStore` action | `saveMatch` | `saveMatch` |
| `collectStore` action | `saveBets` | `saveBets` |

`api/match.ts` 的三个函数分别对应 `API_SaveMatch`、`API_SaveBet`、`API_SaveLiveTimer` 接口。各平台采集器调用的是 store action 名（`saveMatch`/`saveBets`），store 内部再调用 API 函数。

### `collectStore` 语义

`CollectConfig` 只控制是否调用 `saveMatchSource`/`saveBetSource` 上报数据，**不控制**浏览器是否连接场馆。采集器始终运行，开关仅是 `collectStore.saveMatch` / `collectStore.saveBets` 内部的上报门控。

### `oddsStore` (`fo`)

Keyed by `platform → oddId`. HTTP polls write the initial value; MQTT/WS pushes write incremental updates. OB handles three MQTT topics: `/market/oddsUpdate/`, `/market/statusUpdate/`, `/market/suspended/`. All other `/odd/*` topics are subscribed but have no handler (same as A8 UMe). `pendingBetLocks` handles the race where a lock message arrives before the HTTP poll writes the `betId` into the index.

### OB platform specifics

- Collect credentials come from `Client_GetCollectPlatform("OB")` → backend `store.getPlatform("OB")` → populated at startup by `resolveObSession()` (trial login URL: `https://djtop-capi.v662n.com/cApi/v2/member/login?merchant=6107384714184464&demo=1`).
- Token-refresh on `data === "token"` response: frontend `refreshObCollectToken()` hits the same trial URL directly, extracts `token` from the `data.pc` URL, and calls `API_UpdatePlatform({ provider: "OB", token })`. Gateway is **not** updated in this path.
- MQTT client ID is hardcoded: `mqttjs_dj1250901313125773543` (matches A8 bundle).
- Betting `secret_key` = `md5(token_ts_uid_)`.

### A8 parity documentation

All A8 parity tracking lives under `client/web/docs/`:

| File | Purpose |
|------|---------|
| `A8_OB_REPLICATE_PLAN.md` | OB-specific parity plan with `[A8 可证实]` / `[changmen 推测]` / `[changmen 扩展]` labels |
| `A8_PARITY_REGISTRY.md` | **对齐总览**（配置/时序/投注/UI/平台/扩展/缺口） |
| `A8_UI_PARITY_GAPS.md` | UI diff checklist |
| `A8_WALKTHROUGH_CHECKLIST.md` | Manual side-by-side walkthrough checklist |
| `A8_SCRIPT_PLUGIN_PLAN.md` | Script + plugin architecture, Mode P startup, progress |
| `A8_REPLICATE_8_PLATFORMS.md` | Per-platform collect + bet parity status |
| `A8_PARITY_AUDIT_MACHINE.json` | 历史机器审计快照（`audit:a8` 脚本已下线，2026-07） |

**Label convention** (must be used in all new parity comments and docs):

- `[A8 可证实]` — directly traceable to bundle code or Network capture
- `[changmen 推测]` — inferred from API shape / response without A8 server source
- `[changmen 扩展]` — capability that does not exist in A8 bundle at all

### 投注账号（A8 前端 + 后端演进）

**原则**：前端 `stores/account`（Io）严格对齐 A8 `index.js`——`loadAccounts` / `persistAccounts` / 余额刷新后 `saveAccounts` 的时序与 API 调用与 bundle 一致，**不得**添加 A8 没有的门控（如空列表 skip、admin 预览 skip save）。

**后端**是唯一演进面，且必须 **兼容 → 迁移 → 内部重构**：

| 阶段 | 目标 |
|------|------|
| 兼容层 | `Client_*` 形状不变；`handleSaveAccounts` 在 A8 发来 `[]` 时查 RDS 拒绝覆盖；`owner_user_id` + 归属校验 |
| 迁移 | 存量 player 回填/拆分；脚本改库后 `loadProfileById` + pm2 restart |
| 内部重构 | 可引入 `user_accounts` 等表，对外仍返回 bigint `accountId`，订单 `player_id` 不断 |

管理端用户工作区预览为 **[changmen 扩展]**（A8 无 `adminWorkspacePreview`）；安全由后端拒绝非法 save（空覆盖、非本人 `playerId`）保证，而非前端 skip。

运维脚本 `fix-sh01-river-accounts.mjs` 等不得跨 profile 复制凭证；优先 `scripts/audit-accounts-full.mjs` 巡检。

完整后端模型与运维命令见 [docs/ACCOUNT_BACKEND.md](./docs/ACCOUNT_BACKEND.md)。

**存储说明（勿与 A8 后端混淆）**：

- `[A8 可证实]`：`index.js` 通过 `Client_GetData` / `Client_SaveData` key=`ACCOUNT` 读写 **JSON 数组**（含 `accountId`、gateway、token 等字段）。
- **A8 服务端如何落库**：黑盒，不可见。
- `[changmen 实现]`：用 RDS `profiles.accounts` **jsonb** 持久化上述 JSON 数组；`players` 表存 playerId 元数据与 `owner_user_id`。这是 changmen 自有设计，只为满足 **Client_* 线协议**，不是 A8 后端复刻。

### Adding a new platform

1. `types/esport.ts` — add to `PlatformId`
2. `client/venue-adapter/registry/` — register in `adapters.ts` + platform meta
3. `client/venue-adapter/{id}/` — `index.ts` + `collect.ts` + `bet.ts`；探针在 `devtools/platform-probes/{dir}/`
4. `runtime/collectors.ts` + `runtime/providers.ts` — 经 `buildCollectorFactories()` 自动注册（新平台需加入 registry）
5. Backend: add `syncXxxFromEnv` / `syncXxxFromSession` in `platform_sync.js` and call it in `ensurePlatformCredentials`

详见 [client/venue-adapter/README.md](./client/venue-adapter/README.md)。
