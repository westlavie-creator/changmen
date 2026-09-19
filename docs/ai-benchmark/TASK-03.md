# TASK-03 — 新增平台接入（canonical registry + drift）

- 任务类型：真实维护任务（调查变体，只读协议）
- Resolver query：`modify platform registry`（存档 `resolver-outputs/TASK-03.json`）
- 预定义 relevant set：registry/manifest.json、adapters.ts、shared/platforms.ts、api-contract schemas.ts/dto.ts、client-core types、chrome-extension platforms.js、check-collect-platforms.js、platforms.example.json、ADD_PLATFORM_CHECKLIST.md、（正确应答还应包含 drift 检查工具）

## Baseline
- Files inspected：33；Relevant：≈30；Irrelevant：≈3
- **Architecture mistakes：1（本组唯一实质误判）**——结论「**没有**现成的全量 drift 检查可发现副本不一致」。真实情况是 Phase 2 已交付 `npm run check:index-drift`。根因：读到审计文档 Phase 1 的 M-11（「平台清单副本 drift 检查缺失」）——该段落在 Phase 2 后已过时被采纳为结论。
- 其余枚举优秀（13 处登记点 + checklist + DEV 自检局限）
- 污染：读审计文档 §2/§8/§9/§11（正是误导来源）；First-pass success：否（Q3 答错）

## Truth-aware
- Files inspected：30；Relevant：≈28；Irrelevant：≈2
- Architecture mistakes：0——正确命中 `check:index-drift` 及其机制（regex 集合比对、exit 1），并指出「不在 npm test 链、非 CI 强制」的局限
- 额外价值：纠正 Context「backend registry/feeds.js 是副本」的表述（实为同一文件的后端消费）；发现 drift 检查未覆盖的 dto.ts / schemas.js 副本
- Evidence usage：显式；First-pass success：是

## Architecture Error Prevention
- **PREVENTED = YES**。Baseline 的工具链知识错误（不存在 drift 检查）被避免；证据：两臂 Q3 结论对立，Truth-aware 与 `package.json` script + build-index.mjs 代码一致。
- 根因链同时暴露一个 TRUTH_ERROR：审计文档 Phase 1 段落（M-11 等）在 Phase 2 后未刷新， actively 误导了读到它的 baseline。

## Context Reduction
- 边际（33→30）。

## Observations
- 本任务是「文档比代码慢」危害的直接实证： stale Truth（审计文档 M-11）比没有 Truth 更糟——它给了 baseline 一个自信的错误结论。
