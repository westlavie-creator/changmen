# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A local replica of the A8 esports odds-aggregation platform. The **only A8 source available** is the minified frontend bundle at `../A8/A8frontendscipts/2.0.1/index.js` (readable version: `index.readable.js`). A8's backend is entirely unknown — it is a black box. All claims about A8 behavior must be traceable to the bundle or network captures; changmen's own backend design is not "A8 parity."

**All commands below must be run from the `changmen/` directory unless stated otherwise.**

---

## Commands

### Install

```bat
npm install --prefix gamebet_backend
npm install --prefix gamebet_frontend/app
```

### Start (development)

```bat
dev.bat                   # Windows: Electron backend (3456) + Vite HMR (5174)
```

Or manually in two terminals:

```bat
# Terminal 1 — backend (Web mode)
cd gamebet_backend && node host/web/index.js

# Terminal 2 — frontend
npm run app:dev           # → http://localhost:5174/app/
```

**Parity mode** (A8 walkthrough verification — browser as the match-list source):

```bat
parity-dev.bat            # ESPORT_BRIDGE=0, ENABLE_OB=0
```

### Build frontend

```bat
npm run app:build         # vue-tsc + vite build → gamebet_frontend/app/dist/
```

### Tests

```bat
npm test                    # 后端 vitest + adapter 冒烟 + 前端 vitest（含 platform_adapter）
npm run test:backend
npm run test:frontend
```

Frontend-only（在 `gamebet_frontend/app/`）：

```bat
npm run test:ob           # offline: GetMatchs shape + provider contract
npm run test:ob:all       # includes live smoke (needs backend on 3456)
npm run test:v4           # PB v4 credit-plate login E2E
npm run audit:a8          # CSS selector + View mapping diff → docs/A8_PARITY_AUDIT_MACHINE.json
```

Live smoke requires backend:
```bat
ESPORT_TEST_BASE=http://127.0.0.1:3456 npm run test:ob-live
```

### Backend one-off scripts (run from `gamebet_backend/`)

```bat
npm run check:collect           # print all platform credential status
npm run check:collect:probe     # + probe each gateway with a live request
npm run ob:login                # fetch OB trial session and print it
npm run account:cli             # interactive account manager
npm run test:adapter            # ob-feed-mode + packaged adapter layout 模拟
npm run electron:portable       # 便携包 → ../../dist_electron/GameBet-portable.zip
node scripts/verify-electron-unpacked.js   # 对 dist_electron_staging/win-unpacked 实机冒烟
```

---

## Architecture

### Directory layout

```
changmen/
├── platform_adapter/     各平台 frontend/backend + registry（canonical 源码）
├── gamebet_backend/      Node.js CommonJS, port 3456
│   ├── host/
│   │   ├── web/              Web Host（node host/web/index.js）
│   │   │   ├── index.js          HTTP server + FeedHub + proxy 编排
│   │   │   ├── http_routes.js    所有 /api/ 路由
│   │   │   ├── static_files.js   静态文件服务
│   │   │   ├── snapshot_ws.js    /feed/ WebSocket 快照
│   │   │   └── proxy/            Web 专用 WS relay（OB/RAY/TF/IA）
│   │   ├── electron/         Electron Host（main: host/electron/main.js）
│   │   │   ├── main.js           IPC handlers + relay cores + require('../web/index.js')
│   │   │   ├── preload.js        contextBridge（gamebetApi + gamebetRelays）
│   │   │   └── loading.html      启动等待页
│   │   └── electron-builder.yml
│   ├── core/                 Business Core（两个 Host 共用）
│   │   ├── esport-api/           路由/store/match合并/初赔/platform_sync
│   │   ├── account/              账号 CLI / 订单 / 余额刷新
│   │   ├── db/                   Supabase 客户端 + 内存缓存
│   │   ├── shared/               FeedHub / adapter_paths / market catalog / storage_paths
│   │   └── integrations/         A8 集成（constants / v4 / socket）
│   ├── platforms/            legacy shim → platform_adapter（阶段 D 删除）
│   ├── relays/                 legacy shim → platform_adapter/*/backend/relay.js
│   ├── scripts/              调试 / 运维 / verify-electron-unpacked.js
│   ├── supabase/             DB 迁移文件
│   └── public/               静态调试页（/feed/ /platforms/）
├── gamebet_frontend/
│   ├── app/              Vue 3 + TypeScript + Vite (base /app/)
│   └── console/          Legacy A8 bundle patch output (read-only reference)
├── gamebet_chromeplug/   Chrome MV3 extension (cross-origin proxy, credential capture)
└── dev.bat / parity-dev.bat
```

### Backend (`gamebet_backend/`)

**三层架构：**

| 层 | 目录 | 职责 |
|---|---|---|
| Host 层 | `host/web/` `host/electron/` | 传输适配：HTTP server / IPC handler / WS relay |
| Core 层 | `core/` | 业务逻辑：路由/store/账号/DB/shared utils |
| Platform 层 | `platform_adapter/` | 各场馆 frontend/backend + registry（canonical） |
| Legacy shim | `platforms/` `relays/` | 一行转发，阶段 D 删除 |

后端经 `core/shared/adapter_paths.js` 的 `requirePlatform` / `requirePlatformFeed` / `requirePlatformRelay` 加载平台模块。详见 `platform_adapter/README.md`。

**两个 Host 入口：**
- **Web**：`node host/web/index.js` — 启动 HTTP server、FeedHub、WS relay、feed bridge
- **Electron**：`host/electron/main.js` — 主进程直接 `require('../web/index.js')`，同时注册 IPC handler 和 relay core；`process.versions.electron` 存在时 WS relay 自动跳过

**Relay core 与 proxy 的分工：**
- `platform_adapter/{ob,ray,tf,ia}/backend/relay.js` — 上游连接逻辑（经 `requirePlatformRelay` 加载）
- `host/web/proxy/` — Web 专用 WS relay 服务端，把上游推送转发给浏览器；Electron 模式下不启动

| Module | Role |
|--------|------|
| `core/esport-api/router.js` | Handles all `Client_*` / `API_*` actions (match list, collect config, accounts, v4, etc.) |
| `core/esport-api/store.js` | JSON file store; esport data lives in `storage/esport/*.json` (env: `ESPORT_DATA_DIR`) |
| `core/esport-api/platform_sync.js` | Populates `platforms.json` at startup; three-level fallback for each platform (FeedHub session → stored JSON → trial/env login) |
| `core/shared/feed_hub.js` | Runs backend platform feeds (OB, RAY, TF…); emits `snapshot`/`oddsUpdate` events |
| `core/esport-api/feed_bridge.js` | When `ESPORT_BRIDGE=1`, writes FeedHub snapshots into `matches.json` (mode D only) |
| `core/db/client.js` | Supabase 客户端（认证 + 数据持久化） |
| `core/db/store.js` | 内存缓存（`_cache`）+ Supabase 异步写；账号读写的主路径 |
| `core/account/order_store.js` | 订单读写，纯 Supabase `orders` 表，无本地副本 |

Auth: Supabase JWT. Credentials in `gamebet_backend/.env` (`SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_KEY`).

**Storage split:**

| Data | Store | Notes |
|------|-------|-------|
| 账号（ACCOUNT） | Supabase `profiles.accounts` | `db/store.js` 内存缓存，登录时从 Supabase 加载 |
| 订单 | Supabase `orders` 表 | 无 Supabase 时返回空，功能完全不可用 |
| 用户设置（CollectConfig / USERCONFIG 等） | `db/store.js` 内存 + Supabase `profiles` 异步写 | 重启丢失（无 Supabase 时） |
| esport 数据（赛事/赔率/平台凭证等） | 本地 JSON（`storage/legacy/esport/*.json`） | 不依赖 Supabase |
| 平台采集凭证 | `platforms.json`（esport 数据目录） | 不依赖 Supabase |

Storage path resolved in `core/shared/storage_paths.js`. Override via `ESPORT_DATA_DIR` or `GAMEBET_STORAGE_DIR`. Example configs: `gamebet_backend/a8_config.example.json`, `gamebet_backend/platforms.example.json`.

### Frontend (`gamebet_frontend/app/src/`)

See `ARCHITECTURE.md` in the same directory for the canonical reference. Summary:

| Directory | Role |
|-----------|------|
| `api/` | All `Client_*` HTTP calls to the backend (`client.ts` wraps token + `post()`) |
| `platforms/{id}/` | Legacy shim → `@platform/{id}`；canonical 在 `platform_adapter/` |
| `platforms/registry.ts` | Re-export `@platform/registry` |
| `runtime/` | `collectors.ts` + `providers.ts` — wired at app startup; registers all adapters |
| `stores/` | 10 Pinia stores; `matchStore` owns the polling loop; `oddsStore` is the real-time odds cache (`fo`) |
| `shared/http.ts` | `directGet` / `directPostJson` — Axios for collect HTTP (bypasses backend proxy) |
| `shared/platformHttp.ts` | Axios for betting account HTTP (supports relay, optional SOCKS proxy) |
| `platforms/shared/` | Legacy shim → `@platform/shared/*`（canonical 在 `platform_adapter/shared/`） |

`@` alias maps to `src/`.

### Two deployment modes

| | Mode P (A8 parity) | Mode D (default dev) |
|--|---|---|
| Env | `ESPORT_BRIDGE=0 ENABLE_OB=0` | `ESPORT_BRIDGE=1` |
| Match list source | Browser `saveMatch` (same path as A8) | Node FeedHub → `matches.json` |
| Bat file | `parity-dev.bat` | `dev.bat` |

Mode P is the **only valid baseline for verifying A8 parity**. Mode D is for local ops.

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

All A8 parity tracking lives under `gamebet_frontend/app/docs/`:

| File | Purpose |
|------|---------|
| `A8_OB_REPLICATE_PLAN.md` | OB-specific parity plan with `[A8 可证实]` / `[changmen 推测]` / `[changmen 扩展]` labels |
| `A8_UI_PARITY_GAPS.md` | UI diff checklist |
| `A8_WALKTHROUGH_CHECKLIST.md` | Manual side-by-side walkthrough checklist |
| `A8_REPLICATE_8_PLATFORMS.md` | Per-platform collect + bet parity status |
| `A8_PARITY_AUDIT_MACHINE.json` | Output of `npm run audit:a8` |

**Label convention** (must be used in all new parity comments and docs):

- `[A8 可证实]` — directly traceable to bundle code or Network capture
- `[changmen 推测]` — inferred from API shape / response without A8 server source
- `[changmen 扩展]` — capability that does not exist in A8 bundle at all

### Adding a new platform

1. `types/esport.ts` — add to `PlatformId`
2. `platforms/registry.ts` — add one entry to `PLATFORM_REGISTRY`
3. `platforms/{id}/` — `index.ts` adapter + `collect.ts` + `bet.ts`
4. `runtime/collectors.ts` + `runtime/providers.ts` — register
5. Backend: add `syncXxxFromEnv` / `syncXxxFromSession` in `platform_sync.js` and call it in `ensurePlatformCredentials`
