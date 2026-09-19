# TASK-04 — matchMerge 间隔可配置（match capability + 互斥）

- 任务类型：真实维护任务（调查变体，只读协议）
- Resolver query：`modify match merge interval and live timer debounce`（存档 `resolver-outputs/TASK-04.json`）
- 备注：原 query `change matchMerge loop interval configuration` 返回 **unknown**——camelCase 查询词不分词（matchMerge≠match+merge），记入 RESOLVER_GAP，实验改用空格分词查询（未改 Resolver）
- 预定义 relevant set：matcher/loop.js、lib/config.js、lib/write_guard.js、lib/heartbeat.js、ops/match_merge_once.js、compose_once.js、backend/server.js、esport-api/store.js、router.ts、ecosystem.config.cjs

## Baseline
- Files inspected：17；Relevant：17；Irrelevant：0
- Architecture mistakes：0——三层互斥（in-flight / 心跳闸 / 部署冻结）、×2.5 staleness 耦合、debounce 与 interval 解耦全部正确
- 污染：轻度（引用审计文档 :139 佐证）；First-pass success：是

## Truth-aware
- Files inspected：16；Relevant：16；Irrelevant：0
- Architecture mistakes：0；同等正确 + 更精确（leading-edge vs trailing 去抖语义、F-02 与互斥讨论的正确隔离）
- Evidence usage：显式（含对 context notFound=[interval,debounce] 的代码补齐）；First-pass success：是

## Architecture Error Prevention
- 未触发。代码入口清晰的深度机制题，强模型 baseline 无损通关。

## Context Reduction
- 无（17→16）。

## Observations
- 对「代码即真相、入口明确」的问题，Truth Context 不提供可测优势；它提供的是等价的捷径（扩展示例：context 直接给了 write_guard/compose_once 证据行号）。
