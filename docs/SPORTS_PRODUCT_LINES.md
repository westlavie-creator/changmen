# 多运动产品线（冻结草案）

> **状态**：阶段 0 文档；代码未按本文大规模迁移。  
> **目标**：平台 + 能力共享；各业务线对称锚点在 `lines/{code}/`（manifest）。电竞实现仍在根目录。

相关：[ARCHITECTURE.md](./ARCHITECTURE.md) · [CATALOG.md](./CATALOG.md) · [TEAM_BOUNDARIES.md](./TEAM_BOUNDARIES.md) · [lines/README.md](../lines/README.md)

---

## 1. 分层模型

```
changmen（平台 monorepo）
│
├── 平台层（仓库根，所有业务线共享）
│   ├── packages/              shared · api-contract · client-core
│   ├── client/venue-adapter/  各平台采集/下注（按 platform 分）
│   ├── client/chrome-extension/
│   ├── server/backend/        HTTP /esport/*（名称历史遗留，实际为全平台 API）
│   ├── server/db/
│   ├── deploy/
│   └── docs/
│
├── 能力层（共享引擎，非独立产品线）
│   ├── client/web/src/extensions/   arbBet · valueBet · arbOpportunity…
│   ├── server/matcher/ · match-engine/ · team-resolver/
│   └── server/value-bet/
│
├── 电竞产品线（默认；代码仍在根 — 锚点 lines/esport/）
│   ├── client/web/
│   ├── server/collectors/         polymarket-sports · predictfun-collector
│   └── lines/esport/line.json     → 指向上列路径
│
└── 其他产品线（增量，对称锚点 lines/{code}/）
    └── lines/baseball/            （规划；manifest 已建，无业务代码）
```

**原则**

| # | 规则 |
|---|------|
| 1 | 新业务线 **只** 增 `lines/{code}/` + `line.json`；**不** 复制 `venue-adapter` / `packages` |
| 2 | 电竞 **暂不** 物理迁入 `lines/esport/`（路径/deploy 成本过高）；`line.json` 映射即可 |
| 3 | HTTP 路径 **暂不** 从 `/esport/*` 改名；用 `sport` 过滤与 catalog 做数据隔离 |
| 4 | 套利等能力运动无关；新线通过 `capabilities` 字段声明复用 |
| 5 | 文档以 `docs/` 为 canonical；`lines/*/README.md` 只写该线差异 |

---

## 2. 目录对照（现状 → 目标）

| 现状 | 问题 | 整合目标 |
|------|------|----------|
| 无产品线锚点 | 业务线边界不清 | ✅ `lines/{code}/` + `line.json`；电竞映射根目录 |
| `server/*-collector` 平铺 | 难发现、难复用 | ✅ 已归入 `server/collectors/`（§5） |
| `GAMES.md` + `game_catalog.json` | 双份维护 | ✅ 合并为 [CATALOG.md](./CATALOG.md)；GAMES/MARKETS 已删 |
| `server/backend/scripts/` 167 文件 | 69 个 `_tmp`/`_diag` | ✅ 根 9 + `archive/` + `ops/`；**冻结** |
| `vps/scripts/` 1 文件 | 与 `deploy/` 重复 | ✅ 已迁入 `deploy/scripts/`，删除 `vps/` |
| 无 `sport` 维度 | 多运动数据混 | ✅ `sport_catalog` + `game.sport`（见 [CATALOG.md](./CATALOG.md)） |

---

## 3. 产品线一览

| sport code | 产品名 | 锚点 | 代码位置 | PM2 | 阶段 |
|------------|--------|------|----------|-----|------|
| `esport` | 电竞 | `lines/esport/` | 仓库根（见 `line.json`） | `changmen-esport` `changmen-pm-sports` `changmen-predictfun-collector` | **全栈** |
| `baseball` | 棒球 | `lines/baseball/` | 待建 | `changmen-baseball`（规划） | **规划** → 只读 → 采集 → 套利 |

### 电竞组件路径（`esport`，代码在仓库根）

| 组件 | 路径 |
|------|------|
| 前端 | `client/web/` |
| 场馆 adapter | `client/venue-adapter/` |
| API + 代理 | `server/backend/` |
| 合并 | `server/matcher/`、`server/match-engine/` |
| PM Sports WS | `server/collectors/polymarket-sports/` |
| 生产 PM2 | `changmen-esport`、`changmen-pm-sports`、`changmen-predictfun-collector` |

---

## 4. 棒球（baseball）落地路线

与已移除的足球轻量 app 不同，棒球应 **更早** 接入 catalog + 采集，避免与电竞栈脱节。

### 阶段 B1 — 只读控制台

- 锚点：`lines/baseball/`（workspace `changmen-baseball` 规划）
- 数据源：Polymarket Gamma，`sport=mlb`（PM `/sports` id=8）
- 端口：`:3458`（`BASEBALL_PORT`），路径 `/baseball/*`
- 鉴权：与电竞共用 `JWT_SECRET`（只验签）
- **不** 写 `client_matches` / matcher

### 阶段 B2 — 采集 + 第二平台

- `packages/shared/catalog` 注册 `mlb` game（`sport: baseball`）
- `client/venue-adapter` 扩展 PM MLB + 第二平台（如 PB）
- `API_SaveMatch` / `API_SaveBet` → RDS `platform_*`
- matcher 使用 **`matcherProfile: baseball`**（无 Map/Bo，见 CATALOG）

### 阶段 B3 — 合并 + 双边套利

- `server/team-resolver` MLB 队名插件
- `Client_GetMatchs` 请求带 `sport: baseball`（向后兼容，默认 `esport`）
- 复用 `executeArbBet` / LinkID / 补单契约（[ARB_LINK_ID.md](./ARB_LINK_ID.md)）
- UI：独立轻量页 **或** `client/web` sport 切换（后期统一）

### 棒球专用文档（B3 前补充）

- `docs/ARB_BASEBALL.md` — 场馆腿、盘口类型（moneyline / run line）、PM delayed 与 PB 差异

---

## 5. server 扩展进程分组（渐进）

**目标结构**（电竞 collector 已迁入）：

```
server/collectors/
├── README.md
├── polymarket-sports/
├── predictfun-collector/
└── mlb-gamma-collector/    # 棒球 PM REST（规划）
```

**collector 约定**

| 项 | 规则 |
|----|------|
| 写入 | `platform_matches` / `platform_bets`，或 `client_matches.pm_sport`（仅 PM 赛程快照） |
| parse | canonical 在 `client/venue-adapter/{platform}/parse.ts`；Node daemon 薄封装或共享 `.mjs` |
| PM2 | 在 `deploy/ecosystem.config.cjs` 按运动分组注释 |
| 测试 | 各 collector 包内 `node --test` |

---

## 6. 数据隔离策略

### 推荐（阶段 1 起）：单库 + sport 过滤

| 表 / 字段 | 策略 |
|-----------|------|
| `client_matches.game` | 存 catalog `game.code`（如 `mlb`、`cs2`） |
| `client_matches` 查询 | `Client_GetMatchs` 增可选 `sport`；matcher 只合并同 sport 的 `platform_*` |
| `platform_matches` | 按上报平台 + `source_game_id` 过滤；catalog 反查 `sport` |
| matcher 进程 | 短期：单进程 + sport 参数；长期：可按运动拆 PM2 |

### 不推荐（MVP 前）

- 棒球与电竞 **无过滤** 共用 matcher → 污染 merge_key / 套利选腿
- 为棒球 **复制** 整套 `server/backend` API

---

## 7. API 与命名（短期冻结）

| 项 | 电竞现状 | 棒球 MVP | 后期可选 |
|----|----------|----------|----------|
| 路径前缀 | `/esport/*` | 同左 | `/api/*` 或 `/sports/{sport}/*` |
| Action 名 | `Client_GetMatchs` 等 | 同左 | 不改名，只加请求字段 |
| PM2 主进程 | `changmen-esport` | 加 `changmen-baseball` | — |
| 前端 API base | 相对 `/esport/` | 棒球只读 app 可独立；全栈仍走同源 | `VITE_API_BASE` |

---

## 8. 脚本整理（✅ 阶段 19 冻结）

### 三分法

| 位置 | 用途 |
|------|------|
| `scripts/deploy/` | 本机 → VPS tarball 部署 |
| `scripts/sync/` | 本机 `.env` 片段 → VPS（Telegram、Poly Builder、Predict.fun key） |
| `scripts/archive/` | 废弃 / 一次性仓级工具 |
| `deploy/scripts/` | VPS bash（deploy、sync-remote、caddy） |
| `server/backend/scripts/` | 后端运维：根目录 **9 个冻结入口** + `ops/` + `archive/` |

索引：[scripts/README.md](../scripts/README.md) · [deploy/scripts/README.md](../deploy/scripts/README.md) · [server/backend/scripts/README.md](../server/backend/scripts/README.md)

### 已完成

- ✅ `server/backend/scripts/`：`archive/` + `ops/{incidents,diagnostics,migrations}/`；根目录仅启动与日常 CLI
- ✅ `vps/` 删除；`deploy/scripts/` 为 canonical
- ✅ `scripts/deploy/` + `scripts/sync/` 收拢本机运维

### 遗留

- ✅ `vps/scripts/sync-git-to-flat-app.sh` → `deploy/scripts/sync-git-to-flat-app.sh`；`vps/` 已删除

---

## 9. 文档整合（阶段 0 清单）

| 动作 | 文件 |
|------|------|
| ✅ 多运动总览 | 本文 `docs/SPORTS_PRODUCT_LINES.md` |
| ✅ Catalog 单一入口 | [CATALOG.md](./CATALOG.md) |
| 更新索引 | ✅ [docs/README.md](./README.md) |
| 根 README 瘦身 | ✅ [readme.md](../readme.md) |
| Catalog 单一入口 | ✅ 删除 `GAMES.md` / `MARKETS.md`，仅 [CATALOG.md](./CATALOG.md) |
| 历史笔记归档 | ✅ [archive/20260620.md](./archive/20260620.md) |
| 产品线锚点 | ✅ [lines/](../lines/README.md) · esport · baseball |

---

## 10. 执行顺序（汇总）

```
阶段 0  文档 + 脚本整理（本文 + CATALOG.md）
   ↓
阶段 1  sport_catalog.json + game_catalog.sport 字段（见 CATALOG.md）
   ↓
阶段 B1 lines/baseball 只读（PM MLB）
   ↓
阶段 B2 第二平台 + SaveMatch + matcher baseball profile
   ↓
阶段 B3 套利 UI + ARB_BASEBALL.md
   ↓
（可选）电竞迁 lines/esport/
```

---

## 11. 变更记录

| 日期 | 说明 |
|------|------|
| 2026-07-13 | 阶段 4：目录整理冻结；`sync-predictfun-key` → `scripts/sync/`；collectors 子 README |
| 2026-07-13 | 阶段 3：`deploy/scripts/README`；`backend/scripts` 根目录再下沉 4 个；`read-telegram-token` → `scripts/sync/` |
| 2026-07-13 | 阶段 2C：`scripts/sync/` 收拢 Telegram / Poly Builder env 同步 |
| 2026-07-13 | 阶段 2：server 子包 README；`backend/scripts` 再下沉 4 个脚本 |
| 2026-07-13 | `server/collectors/` 物理迁入：`polymarket-sports`、`predictfun-collector` |
| 2026-07-13 | P0 文档瘦身：删 `sports/` 空壳、`GAMES/MARKETS`；`docs/archive/`；`docs/README` 文档地图 |
| 2026-07-13 | 阶段 1 taxonomy：`game_catalog.sport`、`sport_catalog.ts` + smoke |
| 2026-07-13 | 阶段 0：脚本/目录整理（backend scripts 分层、vps 删除、collectors README） |
| 2026-07-13 | 初稿：移除足球/篮球后，固定多运动模型与棒球路线 |
