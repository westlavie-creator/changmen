# Catalog 体系（游戏 · 运动 · 玩法）

> **单一真相源**：`packages/shared/catalog/*.json`  
> 本文描述字段语义与扩展规则；原 `server/backend/GAMES.md` / `MARKETS.md` 已删除，内容并入本文。

代码入口：

- `packages/shared/catalog/game_catalog.ts` / `.json`
- `packages/shared/catalog/market_catalog.ts` / `.json`
- `packages/shared/catalog/sport_catalog.json`（**草案**，尚未接入运行时）

---

## 1. 三层关系

```
sport_catalog（运动）
    └── game_catalog（赛事类型：cs2、mlb…）
            └── market_catalog（玩法：match_winner、moneyline…）
```

| 层 | 文件 | 职责 |
|----|------|------|
| 运动 | `sport_catalog.json` | 产品线元数据、matcher 配置、默认 game 列表 |
| 游戏 | `game_catalog.json` | 跨平台 `game_id` → 统一 `code` |
| 玩法 | `market_catalog.json` | 源站原始盘口 → 统一 `market.code` |

---

## 2. `sport_catalog.json`（草案）

路径：`packages/shared/catalog/sport_catalog.json`

### 2.1 顶层字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `version` | number |  schema 版本，当前 `1` |
| `updatedAt` | string | ISO 日期 |
| `description` | string | 人读说明 |
| `sports` | array | 运动条目列表 |

### 2.2 `sports[]` 条目

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `code` | string | ✅ | 稳定 ID：`esport`、`baseball` |
| `name` | string | ✅ | 中文名 |
| `nameEn` | string | | 英文名 |
| `status` | enum | ✅ | `active` \| `planned` \| `deprecated` |
| `defaultGameCodes` | string[] | | 默认启用的 `game_catalog.code` 列表 |
| `matcherProfile` | string | | 合并配置名，对应 `match-engine/profiles/{name}.js`（规划） |
| `linePath` | string | | 产品线锚点目录，如 `lines/baseball`；与 `lines/{code}/line.json` 对应 |
| `apiSportFilter` | string | | `Client_GetMatchs` 过滤值，通常与 `code` 相同 |
| `pm2Apps` | string[] | | 关联 PM2 进程名 |
| `collect` | object | | 采集策略（见下） |
| `markets` | string[] | | 启用的 `market_catalog.code` 列表 |

### 2.3 `collect` 对象

| 字段 | 类型 | 说明 |
|------|------|------|
| `mode` | enum | `browser`（客户端 venue-adapter）\| `daemon`（VPS collector）\| `both` |
| `daemons` | string[] | workspace 名，如 `@changmen/polymarket-sports` |
| `platforms` | string[] | 参与采集的平台 ID（manifest） |

### 2.4 示例条目（草案内容）

**电竞 `esport`** — `status: active`，`defaultGameCodes`: cs2, lol, dota2, valorant, kog，`matcherProfile`: `esport`，`markets`: `match_winner`。

**棒球 `baseball`** — `status: planned`，`defaultGameCodes`: `mlb`，`matcherProfile`: `baseball`，`linePath`: `lines/baseball`，`markets`: `moneyline`（规划，待写入 market_catalog）。

---

## 3. `game_catalog.json` 扩展

### 3.1 现有字段（不变）

`code`、`name`、`nameEn`、`a8GameId`、`platforms`（各平台 native id）

### 3.2 新增字段（阶段 1，向后兼容）

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `sport` | string | `"esport"` | 指向 `sport_catalog.code`；旧条目缺省时视为电竞 |

### 3.3 棒球预留条目（阶段 B2 写入）

```json
{
  "code": "mlb",
  "sport": "baseball",
  "name": "MLB",
  "nameEn": "Major League Baseball",
  "platforms": {
    "Polymarket": "mlb",
    "PB": "baseball"
  }
}
```

`platforms` 各键需在接入时实测补全；PM 侧 `sport` slug 为 `mlb`（`/sports` id=8）。

### 3.4 环境变量（现有 + 规划）

| 变量 | 说明 |
|------|------|
| `AGGREGATE_GAME_CODES` | 逗号分隔子集；电竞沿用 |
| `AGGREGATE_SPORT` | **规划**：单运动部署时设 `baseball`，限制 matcher + GetMatchs |

---

## 4. `market_catalog.json`

### 4.1 与 A8 `index.js` 的关系

`A8/index.js` 混有两层逻辑，不要混为一谈：

| 层级 | A8 在做什么 | 数据形态 |
|------|-------------|----------|
| **页面 / Dashboard** | 读 A8 API、`fo` 缓存、聚合 WS | 已整理：比赛、盘口名、主客赔率已对齐 |
| **浏览器插件采集** | 直连 OB/RAY 源站 HTTP，再 `saveBets` 上传 | **原始 API** → 本地用 `betName` 正则筛盘 |

changmen = 插件采集层 + 自建 Dashboard。规则写在 **`market_catalog`**，在源站原始字段上生效；**不能**以 A8 页面里的 `BetName` 反推选盘规则。

### 4.2 判定模型

对每个 `market.code`（如 `match_winner`），在对应平台源站数据上选盘：

```text
OB（已配置 gameOddTypes 的游戏，如 CS2）
    → odd_type_id + round 精确匹配
    → excludeIf / require @T1@T2

OB（未配置的游戏） / RAY
    → testOn 字段 + RegExp(betName)
    → excludeIf / require
    → 命中则 marketCode = match_winner
```

### 4.3 电竞现状：`match_winner`

- **OB**：`game/view` 中 `odd_type_id`（玩法类型码）+ `round`；CS2 等游戏的 full/map ID 见 `market_catalog.json` → `platforms.OB.gameOddTypes`
- **RAY**：`group_name` 匹配 `^获胜者$`；排除 status=4
- **OB 回退**：未配 `odd_type_id` 时用 `betKey` / `cn_name` 正则（见 JSON 内 `betName`）

刷新 OB 玩法类型码：`node scripts/platforms/ob/collect_odd_type_ids.js --write`（在 `server/backend` 或探针目录，视脚本位置而定）。

代码入口：`resolveMarketCode('OB', { market, raw })`；OB `obPickWinMarket`、RAY `rayIsAggregatedOddsRow`（`market_catalog.mjs`）。

### 4.4 运动 profile（规划）

在 `market_catalog.json` 增加顶层或 per-market 字段：

| 字段 | 说明 |
|------|------|
| `sportProfiles` | 按 `matcherProfile` 覆盖选盘规则 |
| `esport` | 保留 Map/Bo、`odd_type_id` |
| `baseball` | 无 `round`；moneyline 2 路；可选 run_line / total |

### 4.5 棒球玩法（规划，B2 起）

| code | 名称 | 说明 |
|------|------|------|
| `moneyline` | 胜负 | 2 路，无平局；套利 MVP 首选 |
| `run_line` | 让分 | 后期 |
| `total` | 大小分 | 后期 |

**MVP 建议**：双边套利先只做 `moneyline`，与电竞 `match_winner` 全场合并对齐 implied 逻辑。

---

## 5. 运行时接入点

### 阶段 1 已完成（2026-07-13）

| 组件 | 状态 |
|------|------|
| `game_catalog.json` | 每项 `sport: esport` |
| `game_catalog.ts` | `getGameSport()`、`DEFAULT_GAME_SPORT` |
| `sport_catalog.ts` | `getSport()`、`listActiveSports()`、`getSportForGameCode()` |
| `npm run test:catalog-smoke` | 含 `sport_catalog_smoke.test.ts` |

### 留待棒球 B2（不改行为）

| 组件 | 改动 |
|------|------|
| `match-engine` | `matcherProfile` 分支：跳过 Map/promote（baseball） |
| `server/matcher` | merge 输入按 sport 过滤 `platform_*` |
| `router.ts` `Client_GetMatchs` | 请求体可选 `sport` |

---

## 6. 与文档/目录的对应

| 文档 / 配置 | 职责 |
|-------------|------|
| 本文 §3 | 原 `GAMES.md` 内容（游戏类型） |
| 本文 §4 | 原 `MARKETS.md` 内容（玩法 / 选盘） |
| [SPORTS_PRODUCT_LINES.md](./SPORTS_PRODUCT_LINES.md) | 产品线 + 棒球路线 |
| `packages/shared/catalog/*.json` | **唯一配置源** |

---

## 7. 变更记录

| 日期 | 说明 |
|------|------|
| 2026-07-13 | P0.5：`productPath` 更名为 `linePath`；锚点 `lines/{code}/` |
| 2026-07-13 | P0：删除 GAMES/MARKETS 指针；`sports/` 并入 SPORTS_PRODUCT_LINES |
| 2026-07-13 | 文档瘦身：readme / GAMES / MARKETS 改指针；选盘细则并入 §4 |
| 2026-07-13 | 初稿：sport_catalog 字段设计；game/market 扩展规划 |
