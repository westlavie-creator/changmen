# Stake 采集

## 入口

`stake/index.ts` → `startStakeCollector()`

## 双通道

| 通道 | 间隔 | 作用 |
|------|------|------|
| A8 插件 GraphQL `/_api/graphql` | 60s | `STAKE_GRAPHQL` + `STAKE_SPORT_SLUGS` → `acc.mergeGraphqlMatch` |
| A8 Socket 频道 `Stake` | 实时 | `createA8BetsCollector({ useDirectIds: true })` ingest |

## GraphQL

- 通过 `a8/pluginBridge` 在 A8 已打开 Stake 标签页发请求（`getStakeTabId`）
- `stake/core.ts`：`normalizeGraphqlSport`、赛事 `startTime` 过滤 `> now + 1h` 跳过

## 赔率 ID

`useDirectIds: true` — 使用推送内的 `homeId` / `awayId`，非 `betId:1/2`。

## 子模块

| 文件 | 说明 |
|------|------|
| `stake/http.ts` | 无插件时的 HTTP 回退 |
| `stake/core.ts` | GraphQL 查询与解析 |

## 下单

- Provider：`packages/platform-adapter/stake/frontend/bet.ts`（GraphQL `sportBet` mutation）
- 经 `a8PluginPost` 在已绑定 tab 发请求；联调步骤见 `packages/platform-adapter/stake/README.md`

## A8 对照

`PQ` + `StakeFeed` 频道；下单逻辑对齐 bundle `eu` Provider。
