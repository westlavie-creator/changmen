# TASK-02 — realtime-hub 新增频道（runtime ≠ capability）

- 任务类型：真实维护任务（调查变体，只读协议）
- Resolver query：`modify realtime hub`（存档 `resolver-outputs/TASK-02.json`）
- 预定义 relevant set：server/realtime-hub/**、server/backend/server.js、http_routes.js、client 侧 changmenHub.ts / pmSportRealtime.ts / pubsubClient.ts、TEAM_BOUNDARIES.md、ecosystem.config.cjs

## Baseline
- Files inspected：28；Relevant：≈25；Irrelevant：≈3
- Architecture mistakes：0（正确：内嵌 changmen-esport、channels.js:3 定义、pubsub 通用层不用改、边界矩阵正确）
- 污染：轻度（grep 命中审计文档与 build-index 一次，用于佐证频道注册方式）
- First-pass success：是；Token/context：UNKNOWN

## Truth-aware
- Files inspected：25；Relevant：≈23；Irrelevant：≈2
- Architecture mistakes：0；11 条 context 证据全部回验一致；指出 portEnv(PM_MARKET_HUB_PORT) 易误导细节
- Evidence usage：显式；First-pass success：是

## Architecture Error Prevention
- 未触发（任务 entry point 清晰，baseline 无 runtime 误判）

## Context Reduction
- 边际（28→25，协议噪声级）。不计为显著。

## Observations
- runtime≠capability 考点：两臂都答对（embedded, not standalone）。Context 的价值体现在「changmen-esport.hosts 7 capabilities」一次性给出进程全貌，替代了 baseline 的三处拼凑（ecosystem+README+TEAM_BOUNDARIES）。
