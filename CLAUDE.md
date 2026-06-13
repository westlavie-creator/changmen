# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

changmen 是 **客户端 + 服务端** 系统（对标 A8 的分工），不是「单机本地工具」：

| 角色 | 组件 | 职责 |
|------|------|------|
| **客户端** | `apps/web`、Chrome 插件（`apps/chrome-extension`） | 连各博彩平台、采集比赛/赔率、下注；通过 `API_SaveMatch` / `API_SaveBet` 上报 |
| **服务端** | `apps/backend`、`apps/matcher`、Supabase | 接收上报、合并赛事（`client_matches`）、鉴权、账号/订单、HTTP 代理 |

开发时后端 `localhost:3560`（Windows 默认，见 `BAT\backend.bat`）/ `3456`（非 Windows）+ Vite `5174` 为本机联调地址；生产见 [PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md)（同源 `/` + `/esport/*`）。

A8 参考：仅有 minified bundle（`../A8/A8frontendscipts/2.0.1/index.js`）。A8 官方服务端不可见。changmen 服务端 API 形状由 bundle **反推**；行为验收以 bundle / 抓包为准，不是「本地复刻版后端」。

**All commands below must be run from the `changmen/` directory unless stated otherwise.** Windows `.bat` 均在 `BAT/`（例如 `BAT\dev.bat`）。

**生产部署**：[PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md)（M1 架构冻结、环境变量、双进程清单）

---

## Commands

### Install

```bat
npm install                            # workspaces：shared、backend、matcher、web、chrome-extension、packages
BAT\setup-dev-env.bat                  # 首次：从 .env.example 复制 apps/backend/.env
```

（根目录 `npm install` 会 hoist 全部 workspace 依赖，含 `@supabase/supabase-js` 与 Vite。）

### Start (development)

HTTP 由 `apps/backend/server.js` 提供。**开发**：`BAT\dev.bat`（backend + Vite + Chrome 插件）；**生产**见 [PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md)。

```bat
BAT\dev.bat               # backend + Vite 5174（推荐）
BAT\dev-web.bat           # 同 dev.bat（别名）
BAT\setup-dev-env.bat     # 首次：复制 apps/backend/.env
BAT\backend.bat           # 仅 Web 后端
npm run matcher:ui        # 可选：独立 matcher UI http://localhost:4567（主站已集成 /matcher/）
```

**不要同时启动两套 `npm run web`**（Windows 默认均占 **3560**）。

手动两终端（Web）：

```bat
cd apps/backend && npm run web    # server.js
npm run app:dev                       # → http://localhost:5174/
```

**Parity mode**（Web Host，浏览器为列表源）：

```bat
BAT\parity-dev.bat        # Web Host + Vite + matcher (browser collect)
```

### Build frontend

```bat
npm run app:build         # vue-tsc + vite build → apps/web/dist/
```

### Tests

```bat
npm test                    # 后端 vitest + adapter 冒烟 + 前端 vitest（含 platform_adapter）
npm run test:backend
npm run test:frontend
```

Frontend-only（在 `apps/web/`）：

```bat
npm run test:ob           # offline: GetMatchs shape + provider contract
npm run test:ob:all       # includes live smoke (needs backend on 3560 / PORT)
npm run test:v4           # PB v4 credit-plate login E2E
npm run audit:a8          # CSS selector + View mapping diff → docs/A8_PARITY_AUDIT_MACHINE.json
```

Live smoke requires backend:
```bat
ESPORT_TEST_BASE=http://127.0.0.1:3560 npm run test:ob-live
```

### Backend one-off scripts (run from `apps/backend/`)

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
├── packages/
│   ├── shared/             @changmen/shared：catalog、db、odds、im_parse、match_time
│   ├── platform-adapter/   @changmen/platform-adapter：各平台 frontend/backend + registry
│   ├── team-resolver/      @changmen/team-resolver：队名映射与爬虫
│   └── match-engine/       @changmen/match-engine
├── apps/
│   ├── backend/            Node.js ESM，port 3560 (Win) / 3456
│   ├── matcher/            rebuild 循环 + 人工关联 Web
│   ├── web/                Vue 3 + Vite (base /)
│   └── chrome-extension/   Chrome MV3
├── docs/                   架构文档入口 ARCHITECTURE.md
└── BAT\dev.bat / BAT\parity-dev.bat
```

### 代码边界（依赖方向）

| 目录 | 可 require |
|------|------------|
| `apps/backend` | `packages/shared/*`、`packages/platform-adapter`（`adapter_paths` / `reqS`） |
| `apps/matcher` | `packages/match-engine`、`packages/shared/*`、`@changmen/team-resolver` |

`Client_GetMatchs` **不**在 backend 内合并；只读 `client_matches`（由 `apps/matcher` rebuild 写入）。

### Backend (`apps/backend/`)

**分层：**

| 层 | 目录 | 职责 |
|---|---|---|
| 入口 | `server.js`、`http_routes.js`、`proxy/` | HTTP server + HTTP 代理 |
| Core | `core/` | 业务逻辑：路由/store/账号/DB/shared utils |
| Platform | `platform_adapter/` | 各场馆 frontend/backend + registry（canonical） |

后端经 `core/shared/adapter_paths.js` 的 `requirePlatform` 加载平台模块。详见 `packages/platform-adapter/README.md`。

**入口：** `node server.js` — HTTP server、HTTP 代理、esport-api

**proxy/：** 各平台 HTTP 中继（`http_proxy_relay.js`、`ob_http_proxy.js` 等）；WebSocket 由浏览器直连，不经本机网关。

| Module | Role |
|--------|------|
| `core/esport-api/router.js` | Handles all `Client_*` / `API_*` actions (match list, collect config, accounts, v4, etc.) |
| `core/esport-api/store.js` | JSON file store; esport data lives in `storage/esport/*.json` (env: `ESPORT_DATA_DIR`) |
| `core/esport-api/platform_sync.js` | Populates `platforms.json` at startup (stored JSON → trial/env login) |
| `packages/shared/db/` | Supabase 客户端与表操作（`client.js`、`supabase.js`） |
| `core/db/store.js` | 内存缓存（`_cache`）+ Supabase 异步写；账号读写的主路径 |
| `core/account/order_store.js` | 订单读写，纯 Supabase `orders` 表，无本地副本 |

Auth: Supabase JWT. Credentials in `apps/backend/.env` (`SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_KEY`).

**Storage split**（详见 [docs/DATA_STORAGE.md](./docs/DATA_STORAGE.md)）：

| Data | Store | Notes |
|------|-------|-------|
| 账号（ACCOUNT） | Supabase `profiles.accounts` | `db/store.js` 内存缓存，登录时从 Supabase 加载 |
| 订单 | Supabase `orders` 表 | 无 Supabase 时返回空，功能完全不可用 |
| 用户设置（CollectConfig / USERCONFIG 等） | `db/store.js` 内存 + Supabase `profiles` 异步写 | 重启丢失（无 Supabase 时） |
| esport 数据（赛事/赔率/平台凭证等） | 本地 JSON（`storage/legacy/esport/*.json`） | 不依赖 Supabase |
| 平台采集凭证 | `platforms.json`（esport 数据目录） | 不依赖 Supabase |

Storage path resolved in `core/shared/storage_paths.js`. Override via `ESPORT_DATA_DIR` or `GAMEBET_STORAGE_DIR`. Example configs: `apps/backend/a8_config.example.json`, `apps/backend/platforms.example.json`.

### Frontend (`apps/web/src/`)

See `ARCHITECTURE.md` in the same directory for the canonical reference. Summary:

| Directory | Role |
|-----------|------|
| `api/` | All `Client_*` HTTP calls to the backend (`client.ts` wraps token + `post()`) |
| `runtime/` | `collectors.ts` + `providers.ts` — wired at app startup; registers all adapters |
| `@platform/*` | Vite alias → `changmen/platform_adapter/`（canonical 采集/下注源码） |
| `platform_adapter/registry/adapters.ts` | `PLATFORM_ADAPTERS` + `buildCollectorFactories()` |
| `stores/` | 10 Pinia stores; `matchStore` owns the polling loop; `oddsStore` is the real-time odds cache (`fo`) |
| `shared/http.ts` | `directGet` / `directPostJson` — Axios for collect HTTP (bypasses backend proxy) |
| `shared/platformHttp.ts` | Axios for betting account HTTP (supports relay, optional SOCKS proxy) |
| `platform_adapter/shared/` | 采集横切：`collectSession`、`collectNotify`、`socket/`（A8 频道 IM/XBet/Stake） |

`@` alias maps to `src/`.

### 数据采集（客户端 → 服务端）

**服务端不连平台拉列表/赔率**（已删除 Node FeedHub）。采集只在客户端：

```
客户端采集器 → API_SaveMatch / API_SaveBet → 服务端 store → Supabase
matcher（服务端进程）→ client_matches → Client_GetMatchs → 客户端 UI
```

启动开发栈：`BAT\dev-web.bat` / `BAT\dev.bat` / `BAT\backend.bat`。

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

All A8 parity tracking lives under `apps/web/docs/`:

| File | Purpose |
|------|---------|
| `A8_OB_REPLICATE_PLAN.md` | OB-specific parity plan with `[A8 可证实]` / `[changmen 推测]` / `[changmen 扩展]` labels |
| `A8_UI_PARITY_GAPS.md` | UI diff checklist |
| `A8_WALKTHROUGH_CHECKLIST.md` | Manual side-by-side walkthrough checklist |
| `A8_SCRIPT_PLUGIN_PLAN.md` | Script + plugin architecture, Mode P startup, progress |
| `A8_REPLICATE_8_PLATFORMS.md` | Per-platform collect + bet parity status |
| `A8_PARITY_AUDIT_MACHINE.json` | Output of `npm run audit:a8` |

**Label convention** (must be used in all new parity comments and docs):

- `[A8 可证实]` — directly traceable to bundle code or Network capture
- `[changmen 推测]` — inferred from API shape / response without A8 server source
- `[changmen 扩展]` — capability that does not exist in A8 bundle at all

### Adding a new platform

1. `types/esport.ts` — add to `PlatformId`
2. `platform_adapter/registry/` — register in `adapters.ts` + platform meta
3. `platform_adapter/{id}/` — `index.ts` adapter + `frontend/collect.ts` + `frontend/bet.ts` + `backend/` 探针/relay
4. `runtime/collectors.ts` + `runtime/providers.ts` — 经 `buildCollectorFactories()` 自动注册（新平台需加入 registry）
5. Backend: add `syncXxxFromEnv` / `syncXxxFromSession` in `platform_sync.js` and call it in `ensurePlatformCredentials`

详见 [platform_adapter/README.md](./platform_adapter/README.md)。
