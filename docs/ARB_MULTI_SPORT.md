# 多运动接入 — MVP 与收敛

> **目标**：同一主控台按 Tab 看电竞 / 棒球（及以后足球）；列表只读即可。  
> **电竞红线**：`Client_GetMatchs` / matcher / `client_matches` / `matchStore` 主循环 **零改动**。

---

## 1. 冻结决策

| 项 | 约定 |
|----|------|
| 正式入口 | 主控台 `client/web` Tab + 独立 `Client_Get*Matchs` |
| 隔离 | 新运动 **不写** 电竞 `client_matches` |
| 独立站 | 已弃用（`devtools/archive/baseball-web-b1`）；不再新建 `{sport}/web` 平行站 |
| 不做（本期） | matcher profile、跨站匹配、按运动套利管线 |
| **Tab ≠ 套利** | Tab 只换列表板；`matchStore.startMainLoop` 与 sportTab **无关**，切到棒球/足球时电竞套利仍可跑 |
| **检测分开** | 棒球/足球套利检测环（未来）**禁止**塞进 `mainBetLoop`；账号 / 场馆 / 数学 / UI 壳继续共用 |
| **列表轮询** | 棒球/足球板 `v-if` 挂载才 `startPolling`，卸装 `stopPolling`；勿多 Tab 齐刷 |

### N1 列表硬化（已做）

- Gamma 无 series：**抛错**（不缓存空列表）；router `fail` → 前端板子显示 `error`
- API `getBaseball/FootballMatchs`：失败抛错，不再静默 `[]`
- 空态与错误态分开展示（有 error 不显示「暂无比赛」）

### N2 列表缓存（已做 · 强制不碰电竞）

- 进程内存（30s）+ 本机 JSON：`storage/sport/{mlb,soccer}/match_list.json`
- **禁止** 读写 RDS `client_matches` / 改 `GetMatchs` / 写电竞 `platform_*`
- Gamma 失败时若有磁盘快照 → 返回 stale 列表；否则 `fail`
- 验收：`rg client_matches` 在 `sport_gamma_fetch` / `sport_list_cache` / `*_gamma_fetch` 中无读写调用（仅有拒绝路径/注释）
- 冒烟：`sport_list_cache.smoke.test.mjs` 已挂入 `npm run test:catalog-smoke`（防路径回退）；`storage/sport/**` 已 gitignore

### 只读产品冻结（维护态 · 2026-07-15）

多运动 **只读 MVP 已冻结进入维护态**：有 Tab、有列表、有本机缓存、PM∥PF 并列、电竞路径零污染。  
**允许**：隔离回归修 bug、文档勘误。  
**禁止**：N3 matcher、N4 套利环、第三场馆、sport 下注、`PredictFun.bet: true`、改 `GetMatchs` / `client_matches` / `mainBetLoop`。  
**下一闸门** = 产品明确要对齐的第二场馆（如 PM↔PF 合并或 PB）；否则 **不开 N3/N4**。  
**当前主工作面** = 电竞 A8 — 见 [client/web/docs/A8_NEXT_STEPS.md](../client/web/docs/A8_NEXT_STEPS.md)。

手工验收清单（不写新业务）：

1. 电竞列表 + 套利主循环正常（切棒球/足球 Tab 仍跑）
2. 棒球/足球有场；`server/backend/storage/sport/` 有 JSON；PM 与 PF 行并列可见
3. 断网/断 Gamma：有磁盘则 stale 列表，电竞不受影响
4. 上述 `rg` / smoke 隔离仍成立；体育板 **不** seed `oddsStore`

### 验收记录（2026-07-15）

| # | 结论 | 依据 |
|---|------|------|
| 1 Tab ≠ 套利 | 通过（代码） | `sportTab` 仅换板；`appSession.startAppSession` → `startMainLoop`，与 Tab 无关；板子 `v-if` + `stopPolling` |
| 2 磁盘缓存 | 通过 | `storage/sport/mlb|soccer/match_list.json` 存在 |
| 3 stale | 通过（代码） | `sport_gamma_fetch` Gamma 失败读 `readSportListCache` 返回 stale |
| 4 隔离 | 通过 | `npm run test:catalog-smoke` ok；`client_matches`/`@changmen/db` 仅拒绝路径与注释 |
| 5 PF 赔率解析 | 通过 | `sport_predictfun_fetch.smoke`：`{price,size}` + tip mid |
| 6 fo 边界 | 通过（代码） | `createSportListStore` 仅 Sources→fallback；无 `oddsStore.save` |

UI 点验（登录后切 Tab 看电竞循环仍转、棒/足 PM∥PF 赔率）可按日常联调补勾。

### Predict.fun 只读并列（已做 · 仍无匹配/无下单）

- `Client_GetBaseballMatchs` / `GetFootballMatchs`：**Polymarket Gamma + Predict.fun REST** 数组 concat，同场**不合并**
- 实现：[`sport_predictfun_fetch.js`](../server/backend/core/esport-api/sport_predictfun_fetch.js)；缓存 key `mlb_pf` / `soccer_pf`
- 需 `PREDICT_FUN_API_KEY`（backend `.env`）；**不必**启 `changmen-predictfun-collector`（那是电竞 RDS 入库）
- 本机直连 `api.predict.fun` 失败时走 `PREDICT_FUN_HTTP_RELAY_ORIGIN`（HK http-relay；与浏览器 PF transport 同思路）
- 官方形态：棒球多为 `SPORTS_TEAM_MATCH` 单盘双 outcome；足球多为 `SPORTS_MATCH`（见 [MarketVariant](https://dev.predict.fun/marketvariant-14037485d0)）
- 赔率：outcome.`bestAsk`/`bestBid` 为 `{ price, size }`（[Get markets](https://dev.predict.fun/get-markets-25326905e0)）；无价或空盘 → `Status=Locked`（队名仍显示，**不是**匹配失败）
- 前端：体育只读盘 **不写** `oddsStore` / fo。`ViewBetItem` 构造保持 [A8 可证实]（非 HG fallback=0）；`createSportListStore` 在转换后按 `Sources.*` 补 fallback（列表即快照，类比 HG 用 Sources 作展示源）
- 单侧失败：另一侧有数据仍成功；两侧皆失败才 `fail`
- `manifest.json` PredictFun **`bet: false`** 保持；不做 N3 matcher / 不开 sport 下注

---

## 2. 棒球 MVP（已落地）

| 做 | 不做 |
|----|------|
| `Client_GetBaseballMatchs` | 改 `Client_GetMatchs` |
| 服务端 Gamma MLB + Predict.fun → `ClientMatchDto[]` 并列 | matcher / baseball profile / 下单 |
| UI：HomeView「棒球」Tab + `MatchCard` | 棒球套利 |
| `baseballStore` 独立轮询 | 独立棒球站；拆 users/orders |

```text
电竞（不动）
  GetMatchs → client_matches → matchStore → 电竞列表 / 电竞套利

棒球
  GetBaseballMatchs → (Gamma mlb ∥ PredictFun mlb_pf) concat → baseballStore → 棒球 Tab
```

### 协议

```text
POST /esport/Client_GetBaseballMatchs
→ { success: 1, info: ClientMatchDto[] }
```

| DTO 字段 | 来源 |
|----------|------|
| `Game` | `"mlb"` |
| `Matchs.Polymarket` / `Matchs.PredictFun` | 各源 id（并列场次，不合并） |
| `Bets[0].Sources.*` | moneyline；`Type` = Polymarket 或 PredictFun |

### 前端

| 模块 | 路径 |
|------|------|
| API | `getBaseballMatchs()` → `api/match.ts` |
| Store | `stores/baseballStore.ts`（`createSportListStore`） |
| UI | `BaseballBoard.vue` + `MatchCard` |

---

## 3. 足球 MVP（只读，同模式）

| 做 | 不做 |
|----|------|
| `Client_GetFootballMatchs` | 改 GetMatchs / matcher |
| Gamma soccer + Predict.fun → DTO 并列 | 匹配 / 套利 / 下单 |
| HomeView「足球」Tab | 独立 `football/web` |

```text
POST /esport/Client_GetFootballMatchs
→ { success: 1, info: ClientMatchDto[] }  // Game: "soccer"
```

| 模块 | 路径 |
|------|------|
| API | `getFootballMatchs()` → `api/match.ts`（PM ∥ Predict.fun 并列） |
| Store | `stores/footballStore.ts`（`createSportListStore`） |
| UI | `FootballBoard.vue` → `SportMatchBoard` + `MatchCard` |
| Manifest | `lines/football/` |

## 4. 验收

1. `Client_GetMatchs` 与改前一致。  
2. 登录后棒球 / 足球 Tab 能列出对应场次。  
3. **关 Tab / 切到棒球足球不影响电竞套利循环**（Tab 与 mainBetLoop 解耦）。  
4. Gamma / series 失败时板子显示错误文案，而非假「暂无比赛」。  
5. 无 `npm run baseball:dev` / 无 `baseball/web` workspace。

---

## 5. 硬闸门之后（不要提前开）

| 阶段 | 前提 | 隔离要点 |
|------|------|----------|
| **N3 matcher** | 明确第二场馆要对齐 | 读/写下方 `sport_*` 表；**禁止**写电竞 `client_matches`；独立 profile |
| **N4 套利环** | N3 已有合并列表且要自动下单 | 新建 sport loop，**禁止**进 `mainBetLoop` |

无第二场馆 → **不要开 N3 接线**（只有单源 PM 时 matcher 无意义）。建表可先行（零行为变更）。

### N3 schema（已建 · 零行为）

Migration：[`033_sport_matcher_tables.sql`](../server/backend/db/migrations/033_sport_matcher_tables.sql)（`apply-rds-schema` 已挂）。  
Store：`server/db/rds/sport_{client_matches,venue,team}_store.js`；隔离 smoke：`npm run test:catalog-smoke` 含 `sport_matcher_tables.smoke`。

| 表 | 角色 |
|----|------|
| `sport_client_matches` (+ history) | 合并输出；棒/足同表，`sport` 列区分 |
| `sport_venue_matches` / `sport_venue_bets` | 场馆原始；列名 **`venue`**（非 platform）；bets 预留 `market_code`/`line` |
| `sport_canonical_teams` / `sport_team_venue_maps` | 体育队名（手动 gb 从 200000）；与电竞队名表隔离 |
| `sport_client_match_venue_overrides` | 场馆主客 force_aligned / force_reversed |

**仍不做：** Team UI 拖线、PredictFun 下注、N4 套利环。只读 JSON 仍作 API fallback。

### N3 接线（已做 · 电竞零交叉）

| 步骤 | 状态 |
|------|------|
| 033 表 + store | 已做 |
| 摄入 `sport_venue_*` | `sport_venue_ingest` + Get* 路径；落库 **异步**（不阻塞 API） |
| moneyline 合并 → `sport_client_matches` | `sport_merge.js`（当次列表内存合并；**仅双场馆对**替换 API；1h 窗） |
| MLB 队名别名 | `@changmen/team-resolver/sport_team_plugin` + `sport_mlb_aliases.json`（如 A's→athletics）；不读电竞 `team_db` |
| `GetBaseball/FootballMatchs` | `multiVenueCount>0` 返回合并列表，否则 **fallback** 原 concat |
| `Client_GetMatchs` / `buildMatchList` | **不动** |

隔离：`sport_merge` / `sport_*_store` / plugin 不得写 `client_matches`、不得 import 电竞 `team_db`；体育板不 seed fo。