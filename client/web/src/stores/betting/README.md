# stores/betting — 下注编排

对应 A8 `index0706.js` 中 **`hg` match store 内的 `O()` 主循环**：拉列表之后的套利段 + 补单段。  
A8 全部内联；changmen 拆成可单测模块，**行为以 A8 bundle 为准**。

## 调用链

```
matchStore.runMainLoopTick()
  └── match/mainBetLoop.ts::runMainBetLoopTick
        └── runArbBetRound.ts
              ├── [config.betting] a8/runA8ArbRound.ts   # 全表 for match → for bet
              │     └── autoBet/executeArbBet.ts
              │           ├── phases/prepareArbAttempt.ts   # 选腿、选号、linkId
              │           ├── phases/checkArbLegs.ts        # 预检、checkTimeout
              │           ├── phases/placeArbLegs.ts        # 下单（并行/串行）
              │           ├── phases/settleBothArbLegs.ts   # 并行 settle + 绑单
              │           └── phases/finalizeArbBet.ts      # makeup → mark → notify
              └── [config.makeUp] bettingStore.processLoseOrders → loseOrder.ts
```

## 套利收尾（finalize）

```
placeArbLegs → finalizeArbBet
  ├─ settleBothArbLegs           # refreshBalance、Oe tip、并行 settleArbLeg + bindArbLegOrder
  ├─ applyArbMakeUpFromRejects   # arbMakeUpSides → enqueueMakeUpOrder
  ├─ markArbSuccessLegs
  └─ sync UI / trace / bettingMessage
```

| 主题 | 说明 |
|------|------|
| **方案 A [changmen 编排]** | 双腿并行 `resolveLegOutcome`；A8 bundle 为单次 `wait(max q)`，语义等价验收 |
| **waitTime → q** | UI 内存 `config.waitTime` → `legRejectWaitSec` → 场馆 `venueRejectWaitBeforePoll` |
| **手动 A8 下单** | `manualBet` / `betGateway.placeBet` 不做 A8 场馆拒单复检 [A8 可证实] |
| **PM 手动 delayed** | `betGateway` 内 `settleArbLeg` 为 [changmen 扩展] |

手动双击下注：**不经过本目录调度**，见 `manualBet.ts` → `accountStore.betting` → `account/betGateway.ts`。

## 与 `extensions/` 的区别

| 目录 | 职责 |
|------|------|
| `stores/betting/a8/` | **调度**：哪些 bet 跑 `executeArbBet` |
| `stores/betting/autoBet/` | **执行管线**（单场） |
| `extensions/arbOpportunity` 等 | 盯盘、Telegram、UI；**不是**主循环调度 |

## 入口文件速查

| 文件 | A8 近似位置 |
|------|-------------|
| `runArbBetRound.ts` | `O()` 中 `betting` + `makeUp` 门控 |
| `a8/runA8ArbRound.ts` | `O()` 双层 for 循环 |
| `autoBet/executeArbBet.ts` | `O()` 单场套利体 |
| `autoBet/rejectWait.ts` | `legRejectWaitSec` + Oe tip |
| `autoBet/arbLegSettle.ts` | 套利单腿 `resolveLegOutcome` |
| `autoBet/arbMakeUpPair.ts` | 套利补单配对 `arbMakeUpSides` |
| `autoBet/arbMakeUpFromRejects.ts` | 补单入队 |
| `arbOrderBind.ts` | 绑单 `bindArbLegOrder` |
| `loseOrder.ts` | `O()` 末尾 `y.orders` 补单循环 |
| `manualBet.ts` | UI 双击（A8 同路径经 `h.betting`） |

符号总表：[`../../../../README.md`](../../../../README.md)。
