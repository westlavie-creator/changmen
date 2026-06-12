# IM 采集

## 入口

`im/index.ts` → `startA8BetsCollector({ platform: "IM", channel: "IM", homeSuffix: "1", awaySuffix: "2" })`

对齐 A8 **`EZe`**：聚合 Socket **只推赔率**，不推完整赛事元数据。

## 盘口解析（`im/parse.ts`）

| 函数 | 作用 |
|------|------|
| `imBetNameIsFullMatch` | 「全场 / 总比赛 / BOx 系列赛」→ Map **0** |
| `imBetNameIsMapWinner` | 「第 N 局胜利」→ Map **N** |
| `imBetNameIsCollectible` | 采集保留：全场 + 各地图胜负 |
| `resolveImMapFromBet` | 文案优先于 socket `map:0`（避免全场被覆盖） |
| `pickImSportId` | 从 bet/message 抽 sportId（推送里通常没有） |

落库时 IM 盘口 key：`map:${map}`（同场同地图一条）。

## 开赛时间

- 推送无可靠 `startTime` → **`StartTime = 0`**（不再用 `Date.now()` 冒充）
- 输出前 `a8StartTimeCollectAllowed`：拒绝 `> now + 1h`
- **3h** 无推送（`IM_ODDS_ACTIVE_MS`）则从 `buildPayload` 剔除

## 游戏类型

Socket 常无 `sportId`，采集侧 `SourceGameID` 多为 `"unknown"`。

**列表展示**时由后端 `match_merge.enrichImMatch`：

1. 用 OB/RAY 等同时间段赛事按 **队名** 或 **开赛时间 ±3h** 匹配
2. `game_catalog` 将 OB 原生 `game_id` 转为 IM sportId（如 CS2 → `47`）

修复历史数据：`node scripts/fix-im-stored-data.mjs`

## IM sportId 对照（节选）

| A8 GameID | IM sportId | 游戏 |
|-----------|------------|------|
| 1 | 45 | LOL |
| 2 | 46 | DOTA2 |
| 3 | 47 | CS2 |
| 4 | 48 | KOG |
| 8 | 65 | Valorant |

见 `im/parse.ts` 中 `IM_SPORT_BY_GAME_ID`。

## 签名 / HTTP（下单）

`im/sign.ts`、`im/headers.ts` — 用于 provider 下单，非列表采集主路径。

## 后端对齐

- `packages/shared/im_parse.mjs` — 与前端 parse 同步
- `packages/match-engine/merge/`（`im_enrich.js`、`match_merge.js`）— enrich、去重、列表过滤
