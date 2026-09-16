# Stake 采集 / 下注

对齐 A8 `index0706.js`：`oZ`（GraphQL 快照）+ `LHe`（只写 fo）+ `HHe`（GraphQL 下注）。

实时赔率 **不连** A8 聚合机 `47.115.75.57`；插件 GraphQL WS next 经扩展 `stake-odds` 端口推 changmen。

## 入口

`stake/index.ts` → `startStakeCollector()` / `stakeProvider`

## 采集（对齐 A8 `MQ` / `oZ`）

| 路径 | 周期 | 行为 |
|------|------|------|
| 插件 GraphQL `https://stake.com/_api/graphql` | 30s | `SportIndex` → `saveMatch` / `saveBets`；同时 `LHe` 写 `fo` |
| 插件 GraphQL WS `sportFixtureMarketsNext` | 增量 | 扩展 `stake-odds` 端口 → `applyStakeLiveOdds` 写 `fo` |

前置：Chrome 扩展 + 已登录 `stake.com` 标签（`setTab` / `getStore(Stake)`）。无 tabId 提示与 A8 相同：`未找到Stake标签页`。

CollectConfig 只门控 `saveMatch` / `saveBets` 上报；采集器始终跑（changmen 全局语义）。

## 赔率 ID

盘口 `homeId` / `awayId` 写入 `fo`。A8 `LHe` 不写 `betId:1/2` 后缀；`isLock` 恒 `false`（锁盘靠赔率清零）。

## 下注（对齐 A8 `HHe` / `rJe`）

`stake/bet.ts`：`UserBalances` → `updateUserPreference` → `sportMarketOutcome` → `sportBet`。请求头对齐 A8 `im()`（含 `x-operation-name: CurrencyConfiguration`）。成功文案：`投注成功，${currency}${amount}@${odds}`。

详见 `client/venue-adapter/stake/README.md`。
