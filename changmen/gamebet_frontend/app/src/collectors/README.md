# 采集器（Collectors）

## Changmen 职责（`/app/`）

| 数据 | 负责方 | 本目录角色 |
|------|--------|------------|
| 比赛列表 | **后端** `FeedHub` + `ESPORT_BRIDGE` | 前端读 `Client_GetMatchs`，不以本目录 `saveMatch` 为列表真源 |
| 赔率 | **前端** 各平台 collector | `saveBets` + `oddsStore`（对齐 A8 `fo`） |

前端连接各平台源站拉取/订阅赔率；开关允许时通过 `collectStore.saveBets` 写入后端 `data/esport/bets.json`。

> 术语说明：“采集开关”= 是否**上报保存**（`API_SaveMatch` / `API_SaveBet`），不是是否连接平台。部分代码仍含 `saveMatch`（历史兼容）。

## 开关与实时赔率（重要）

- `CollectConfig` 开关控制的是“是否上报保存到后端”。
- OB 实时赔率更新（HTTP 轮询 + MQTT）不应被该开关停掉。
- 实现上应保持 OB 采集器常驻，关闭开关时仅由 `collectStore.saveMatch/saveBets` 返回 `false` 来阻断上报请求。

## 入口与注册

| 文件 | 作用 |
|------|------|
| [`index.ts`](./index.ts) | `COLLECTOR_FACTORIES` 注册各平台 `start*Collector`；`startCollectors()` / `syncCollectorsFromConfig()` 按 `collectStore` 开关启停 |
| [`../platforms/registry`](../platforms/registry.ts) | `collect: true` 的平台须与本目录 factory 一一对应（DEV 下会 `console.warn` 不一致） |

## 采集模式分类

```text
┌─────────────────────────────────────────────────────────────┐
│  A8 聚合 Socket（socketHub）                                 │
│  IM / XBet / Stake(实时) → a8/betsCollect + a8/index        │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│  平台原生 HTTP 轮询 + 可选 WS/MQTT                           │
│  OB / RAY / TF / IA / SABA / PB / IMT / Stake(GraphQL)      │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│  占位（无 saveMatch 赔率流）                                 │
│  HG                                                         │
└─────────────────────────────────────────────────────────────┘
```

## 开赛时间（对齐 A8）

多数列表采集使用同一规则（秒或毫秒等价）：

**只保留开赛时间 &lt; 当前 + 1 小时** 的赛事（排除「太远未来」的赛）。

| 常量 / 工具 | 位置 |
|-------------|------|
| `A8_MATCH_MAX_FUTURE_MS` | [`utils/a8MatchTime.ts`](../utils/a8MatchTime.ts) |
| `a8StartTimeCollectAllowed` | 同上；IM 采集 [`a8/betsCollect.ts`](./a8/betsCollect.ts) |
| 后端列表 enrich / 过滤 | `gamebet_backend/esport-api/match_merge.js` + `gamebet_backend/shared/a8_match_time.js` |

IM 额外规则：Socket **不推** `sportId` / 可靠 `startTime` 时，`StartTime` 落库为 `0`，游戏类型与队名由后端从 OB 等同场赛事 **enrich**（见 [`docs/IM.md`](./docs/IM.md)）。

## 落库接口

采集统一调用 `useCollectStore()`：

- `saveMatch(provider, CollectMatchDto[])`
- `saveBets(provider, matchId, CollectBetDto[])`

类型定义：[`types/collect.ts`](../types/collect.ts)。

## 平台文档索引

| 文档 | 说明 |
|------|------|
| [docs/A8_COMPARE_ALL_PLATFORMS.md](./docs/A8_COMPARE_ALL_PLATFORMS.md) | **全平台**：A8 vs changmen（Token、采集、下注） |
| [docs/A8_COMPARE_OB_RAY.md](./docs/A8_COMPARE_OB_RAY.md) | **OB / RAY** 详解 |
| [docs/A8_TF_LOGIC_PARITY.md](./docs/A8_TF_LOGIC_PARITY.md) | **TF**：凭证、$3/ly 头、轮询+WS、下注 parity |
| [docs/A8_PB_LOGIC_PARITY.md](./docs/A8_PB_LOGIC_PARITY.md) | **PB（平博）** parity |

| 平台 | 文档 | 数据源 |
|------|------|--------|
| A8 公共框架 | [docs/A8.md](./docs/A8.md) | Socket.IO 聚合 |
| OB | [docs/OB.md](./docs/OB.md) | HTTP + MQTT |
| IM | [docs/IM.md](./docs/IM.md) | A8 频道 `IM` |
| RAY | [docs/RAY.md](./docs/RAY.md) | HTTP + 后端 WS 转发 |
| SABA | [docs/SABA.md](./docs/SABA.md) | 页面解析 + Socket.IO |
| Stake | [docs/Stake.md](./docs/Stake.md) | A8 插件 GraphQL + 频道 `Stake` |
| PB（平博） | [docs/PB.md](./docs/PB.md) | HTTP 欧赔快照 |
| TF | [docs/TF.md](./docs/TF.md) | HTTP + 后端 WS |
| IA | [docs/IA.md](./docs/IA.md) | HTTP + Socket.IO |
| IMT | [docs/IMT.md](./docs/IMT.md) | HTTP Delta 轮询 |
| XBet | [docs/XBet.md](./docs/XBet.md) | A8 频道 `XBet` |
| HG（皇冠） | [docs/HG.md](./docs/HG.md) | 占位（跟单非采集） |
| 共享工具 | [docs/shared.md](./docs/shared.md) | Session / 通知 |

## 数据修复脚本（IM 历史数据）

```bash
node scripts/fix-im-stored-data.mjs
```

Map 重算、盘口去重、A8 时间规则、从 OB 补队名与 IM `sportId`。

## 相关后端

| 模块 | 说明 |
|------|------|
| `gamebet_backend/esport-api/match_merge.js` | `Client_GetMatchs` 列表合并、IM enrich |
| `gamebet_backend/shared/im_parse.js` | IM 盘口 Map / BetName 解析（与前端 `im/parse.ts` 对齐） |
| `gamebet_backend/shared/game_catalog.json` | 各平台 `SourceGameID` ↔ 统一 `code` / `a8GameId` |
