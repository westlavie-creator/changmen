# changmen 架构

单一架构文档入口。命令与日常开发见 [../CLAUDE.md](../CLAUDE.md)。

## 目标目录（monorepo，档 B）

```
changmen/
├── client/
│   ├── web/                     # Vue 控制台
│   └── venue-adapter/             # @changmen/venue-adapter
├── chrome-extension/            # MV3 扩展
├── server/
│   ├── backend/                 # HTTP API、代理、静态托管
│   │   └── scripts/             # 常驻运维；ops/；archive/
│   ├── collectors/              # VPS daemon：polymarket-sports、predictfun-collector
│   ├── matcher/                 # 调度循环 + 人工关联 UI
│   ├── db/                      # @changmen/db
│   ├── match-engine/            # @changmen/match-engine
│   ├── team-resolver/           # @changmen/team-resolver
│   ├── storage/                 # @changmen/storage（本机 JSON 路径）
│   ├── ws_forward/              # @changmen/ws-forward（backend 挂载）
│   ├── realtime-hub/            # @changmen/realtime-hub（Socket.IO 推送）
│   └── value-bet/               # @changmen/value-bet（正 EV 扫描 daemon）
├── scripts/
│   ├── deploy/                  # 本机 → HK VPS（deploy202.bat 等）
│   ├── sync/                    # 本机 .env 片段 → VPS
│   ├── fixtures/                # API 探针快照
│   └── archive/                 # 废弃仓级脚本
├── deploy/scripts/              # VPS bash（canonical；见 deploy/scripts/README.md）
├── lines/                       # 产品线锚点（line.json；电竞代码仍在根）
├── devtools/platform-probes/    # 可选探针 CLI
├── packages/
│   ├── shared/                  # @changmen/shared
│   ├── api-contract/            # HTTP 契约
│   └── client-core/             # @changmen/client-core（web/插件共用 TS）
└── docs/
```

## 迁移进度

| 阶段 | 内容 | 状态 |
|------|------|------|
| 1–15 | 见历史（`packages/*` + `apps/*` 阶段） | ✅ 完成 |
| 16 | **档 B**：`client/` + `server/` 物理分区；`apps/` 退役 | ✅ 完成 |
| 17 | `server/collectors/` daemon 归集；server 子包 README；`backend/scripts` 再分层 | ✅ 完成 |
| 18 | `scripts/sync/`；`deploy/scripts/README`；`backend/scripts` 根目录收尾 | ✅ 完成 |
| 19 | 目录整理**冻结**；`scripts/sync` 边界收拢；collectors 子 README | ✅ 完成 |
| I1 | **路径单点登记**：`CHANGMEN_LAYOUT` + [PATH_REGISTRY.md](./PATH_REGISTRY.md) | ✅ 完成 |
| I2a | **venue-adapter 包化**：`exports` + web 去 tsconfig include | ✅ 完成 |
| I2b | **web import 包名化**：`@venue/*` → `@changmen/venue-adapter/*` | ✅ 完成 |
| I3a | **删 web shim**：`domain/arbitrage`、`providerKeys`、`arbOpportunity` 薄层 → `@changmen/arb-core` | ✅ 完成 |
| I3b | **venue-adapter barrel**：web 深 import 收拢到 `contract`/`registry`/`adaptation`/`shared`/`polymarket`/平台 index | ✅ 完成 |
| I3c | **删 client-core shim**：web 薄 re-export → 直连 `@changmen/client-core/*`；`arbOpportunity` 仅保留 `syncArbRuntime` | ✅ 完成 |
| I3d | **venue 包内聚**：`@venue/*` → `@changmen/venue-adapter/*`；web 移除 `@venue` tsconfig/vite alias | ✅ 完成 |
| I3e | **exports 白名单**：`sync-package-exports` + web barrel 校验；删 `shared/platform` shim | ✅ 完成 |

旧路径 `platform_adapter/`、`gamebet_*` 仅出现在历史章节或迁移对照中；**以本表与代码 `package.json` / `adapter_paths` 为准**。

### 目录整理冻结（阶段 19 后）

此后**不再大规模物理搬家**；新脚本按下列落点添加：

| 类型 | 落点 |
|------|------|
| 本机 → VPS 部署 | `scripts/deploy/` |
| 本机 → VPS env | `scripts/sync/` |
| VPS bash | `deploy/scripts/` |
| 后端启动 / 日常 CLI | `server/backend/scripts/` 根（**冻结**，极少新增） |
| 后端迁移 / 归档兜底 | `server/backend/scripts/ops/migrations/` |
| 排障 / deploy 自检 | `server/backend/scripts/ops/diagnostics/` |
| 事故修复 | `server/backend/scripts/ops/incidents/` |
| 临时探针 | `*/archive/` 或 `backend/scripts/archive/` |
| 新运动 VPS collector | `server/collectors/{name}/` |

## 依赖方向

```
client/web ──@changmen/venue-adapter──► client/venue-adapter
client/web ──HTTP───────► server/backend
client/web ──@changmen/api-contract──► HTTP 路径与 DTO
server/backend ──@changmen/api-contract──► EsportAction
chrome-extension ─（代理/凭证）─► 各平台源站

client/venue-adapter ──采集上报──► server/backend (API_SaveMatch/SaveBet)
server/backend ──读写────► server/db (@changmen/db)
server/matcher ──matchMerge──► @changmen/match-engine + @changmen/shared
server/matcher ──队名────► @changmen/team-resolver（workspace 依赖，可选）
server/team-resolver ──requirePlatform──► @changmen/venue-adapter/loader

server/backend ──requirePlatform──► client/venue-adapter（monorepo 默认）
server/backend ──可选拷贝──► server/backend/platform_adapter（瘦包 / GAMEBET_ADAPTER_ROOT）
```

## packages 说明

### `packages/shared` (`@changmen/shared`)

跨进程共享：游戏/玩法 catalog、赔率格式化、IM 解析、**A8 采集开赛时间窗**（仅未来 1h 上限，无过去下限）。Polymarket 6h 窗在 `client/venue-adapter/polymarket/` [changmen 扩展]。  
数据层与路径解析见 `@changmen/db`（`paths.js`、`load_env.js`）。  
npm workspace 成员；通过 `@changmen/shared` 包名引用。

### `client/venue-adapter` (`@changmen/venue-adapter`)

各平台采集与下注的 canonical 源码。前端通过 `@changmen/venue-adapter`（Vite alias → `client/venue-adapter`）。

**目录语义**：`{platform}/` 为浏览器采集（`collect.ts` / `bet.ts`）；Node 探针与会话模块在 `@changmen/platform-probes`（`devtools/platform-probes/{platform}/`），经 `requirePlatform(id, "node", …)` 加载。详见 [venue-adapter/README.md](../client/venue-adapter/README.md) 与 [platform-probes/README.md](../devtools/platform-probes/README.md)。

各平台 CLI 采集脚本定义在本包 `package.json`；`server/backend` 通过 `npm run <script> --workspace=@changmen/venue-adapter` 转发。

**服务端解析顺序**（`loader/adapter_paths.mjs`）：

1. `GAMEBET_ADAPTER_ROOT`（瘦包显式指定）
2. `client/venue-adapter`（**标准 monorepo**，无需拷贝）
3. `server/backend/platform_adapter`（`npm run sync:platform-adapter` 生成，已 gitignore）

### `server/team-resolver` (`@changmen/team-resolver`)

队名规范化插件；matcher `matchMerge` 与 UI `merge_mode` 动态加载 `team_db.js`。  
爬虫脚本在 `scrapers/`，环境变量通过 `@changmen/db` 的 `loadChangmenEnv()` 加载。

### `server/match-engine` (`@changmen/match-engine`)

`match_merge`、`bet_builder`、`im_enrich`、队名工具、`client_match_ids` 与 vitest/node:test 套件。  
`server/matcher` 通过 `@changmen/match-engine` workspace 依赖引用；测试：`npm run test --prefix server/match-engine`。

## client / server 说明

### 本地开发端口

| 组件 | Windows | Linux / 其它 |
|------|---------|----------------|
| Vite（`client/web`） | `5274` | `5174` |
| `server/backend` | `3560` | `3456` |

Windows 上 Hyper-V 常保留 TCP `5123–5222`，故 Vite 不用 `5174`。配置见 `client/web/vite.config.ts` 与 `server/backend/server.js`。

| 路径 | 职责 |
|------|------|
| `server/backend` | `server.js`、`/esport/*` API、HTTP 代理、静态资源 |
| `server/matcher` | 30s matchMerge、matcher UI、`/matcher/*`；写路径唯一权威 |
| `client/web` | Vue 3 + Vite；开发端口 Win `5274` / 其它 `5174`（`vite.config.ts`） |
| `chrome-extension` | MV3 跨域代理与凭证捕获 |

## 数据流

```
浏览器/插件 (venue-adapter) → API_SaveMatch/SaveBet/SaveLiveTimer → backend → RDS platform_*
matcher matchMerge（finalize 写库）→ client_matches
Client_GetMatchs 只读 client_matches → web（不做 Round/promote overlay）
embedded：SaveLiveTimer debounce ~3s 触发 matchMerge（`MATCHER_TIMER_DEBOUNCE_MS`）
```

巡检：`node server/matcher/scripts/audit-client-sources.mjs`（静态 + rebuild diff；`--strict` 有问题 exit 1）。

## 团队边界（单仓）

客户端 / 服务端目录归属、禁止的跨包 import、HTTP 集成面见 [TEAM_BOUNDARIES.md](./TEAM_BOUNDARIES.md)。本地校验：`npm run check:boundaries`。

## 相关文档

- [TEAM_BOUNDARIES.md](./TEAM_BOUNDARIES.md) — 两团队 monorepo 边界
- [SPORTS_PRODUCT_LINES.md](./SPORTS_PRODUCT_LINES.md) — 产品线分层与棒球路线
- [../lines/README.md](../lines/README.md) — 产品线锚点 `lines/{code}/`
- [CATALOG.md](./CATALOG.md) — sport / game / market catalog（配置单一入口）
- [../server/README.md](../server/README.md) — 服务端各 workspace 包与进程
- [../CLAUDE.md](../CLAUDE.md) — 命令、表结构、采集间隔
- [DATA_STORAGE.md](./DATA_STORAGE.md) — RDS / JSON 边界与 **API 数据策略**（memory-first）
- [../PRODUCTION_DEPLOYMENT.md](../PRODUCTION_DEPLOYMENT.md) — 生产部署
