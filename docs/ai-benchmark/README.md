# AI Development Benchmark — 实验协议与记录（Phase 3）

- 阶段日期：2026-09-19
- 上位文档：[../AI_DEVELOPMENT_BENCHMARK.md](../AI_DEVELOPMENT_BENCHMARK.md)（最终结果）
- 前置：Phase 1（Truth Audit）+ Phase 2（Conflict-aware Index + Resolver）

## 实验方法

对照两个条件：

- **A = BASELINE**：独立 AI 会话只拿到 Task 描述 + 仓库本身（含 CLAUDE.md/docs 等正常项目文档）。不提及 Resolver / Index / .ai/。
- **B = TRUTH-AWARE**：相同 Task 描述 + 会话开始时运行 `node .ai/architecture/resolve-context.mjs "<query>"` 并把 JSON 输出作为额外 Context，附使用规则（视为 evidence 指针而非答案；status=conflicted 不是 resolved truth；humanDecisionRequired=true 必须停下/标记；status=unknown 必须回到代码调查）。

**公平性声明（非严格科学实验）**：

- 同为独立子代理会话，同一模型、同一仓库工作区、同一 Task 文本、同一验收口径；A/B 并行启动，互不共享会话内容。
- 两条件均为**只读调查协议**（不修改代码、不起服务、不跑测试套件）——因此指标聚焦于「定位正确性 / 探索效率 / 架构理解正确性」；「测试失败数」记为 N/A（协议限制），「token/context」记为 UNKNOWN（工具不可靠获取）。
- 该设计使 Benchmark 类型为 **observational**（非随机对照）；所有结论按事实记录，不做胜率排名。
- Baseline 未被告知 `.ai/` 存在；若 Baseline 自行发现并使用 `.ai/`，记为污染事件并如实记录。
- 相关文件集（relevant set）在每个 Task 的 Experiment Card 中**预先定义**，避免事后偏差。

## 指标定义

| 指标 | 操作性定义 |
|---|---|
| Time to first correct module | 代理 `FILES_INSPECTED` 有序列表中首次出现 relevant-set 文件的**序号**（越小越快；代理变量，非墙钟） |
| Files inspected | 代理自报的 FILES_INSPECTED 数量 |
| Relevant files | 与 relevant-set 的交集数 |
| Irrelevant exploration | inspected − relevant（明显无关的探索） |
| Architecture mistakes | 最终 ANSWER 中对 ownership/runtime/capability/boundary/contract/state 的错误断言（对照 Phase 1/2 已验证事实判定） |
| Human corrections | 实验不允许人工中途干预 → 恒为 0；以代理自报 UNCERTAINTIES 数作为替代观察 |
| Test failures | N/A（只读协议） |
| First-pass success | 单次会话内最终 ANSWER 是否正确（无返工机会） |
| Token/context | UNKNOWN（不可靠获取，不估算） |
| Architecture safety | 是否提出危险架构修改（Safety Probe 专测） |
| Evidence usage（B 组） | ANSWER 是否实际引用 Resolver 证据（文件/符号层面回到代码核对） |

## Failure log 分类

`RESOLVER_MISS`（拿到 Context 仍找错）/ `RESOLVER_GAP`（Resolver 未返回关键事实）/ `TRUTH_ERROR`（Truth 本身错误）/ `TRUTH_CONFLICT_BLOCK`（conflict 阻塞进展）。**只记录，不在本阶段修复。**

## 产物清单

- `README.md`（本文件，协议）
- `TASK-01..05.md`、`SAFETY-01.md`（Experiment Cards）
- `resolver-outputs/TASK-*.json`（各 Task 的 Resolver 原始输出存档）
