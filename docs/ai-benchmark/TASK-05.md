# TASK-05 — SXBet 恢复默认生产栈（跨模块：deploy+registry+client+collector+hub）

- 任务类型：真实维护任务（调查变体，只读协议）
- Resolver query：`restore sxbet collector and hub to default deployment`（存档 `resolver-outputs/TASK-05.json`）
- 预定义 relevant set：deploy-server-remote.sh、ecosystem.config.cjs、manifest.json、sxbet-collector/**、ws_forward sxbet 相关、storage/sxbet_market_index.js、venue-adapter/sxbet/**、TEAM_BOUNDARIES.md、PRODUCTION_DEPLOYMENT.md、SPORTS_PRODUCT_LINES.md、match.vpsGate.test.ts、esport-freeze.json

## Baseline
- Files inspected：50；Relevant：≈46；Irrelevant：≈4
- Architecture mistakes：0——git 考古找到暂停提交 3f42b59f 并给出逆操作清单（deploy 脚本 delete 块 + manifest + index.ts 桩 + 文档），发现了客户端半边（manifest collect:false + adapter 桩）
- 污染：读审计文档（M-03/M-07）与 index.json（grep）；First-pass success：是

## Truth-aware
- Files inspected：62；Relevant：≈58；Irrelevant：≈4
- Architecture mistakes：0——等价覆盖 + 当前 5 处 DRIFT 实况 + F-02 治理提示（「若顺带修 matcher 文档/死路径须先人工裁决」）
- Evidence usage：显式；First-pass success：是

## Architecture Error Prevention
- 未触发（两臂均无误判）。两臂都得出「不动 collectionMode（vpsGate 测试约束）」「冻结闸门不含 sxbet」等关键安全点。

## Context Reduction
- 否（50→62，Truth-aware 更多——含对 drift 现况与 F-02 的额外核查）。

## Observations
- 跨模块任务中 baseline 靠 git log 考古达到同等深度——说明「真实历史线索」（暂停提交）是 Truth 系统的有力替代品之一；Truth 的增量在治理提示（F-02）与 drift 现况，不在定位。
