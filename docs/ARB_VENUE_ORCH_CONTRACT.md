# 场馆 ↔ 编排契约（冻结）

与 [ARB_LINK_ID.md](./ARB_LINK_ID.md) 互补：Link 归属编排；**腿终态判定归属场馆**。

## 硬规则

1. **解耦**：拒单 / FOK / delayed 判定只在 `@venue` / `resolveVenueLegOutcome`；编排只消费结果。
2. **有指令必有结果**：编排禁止用「没回」猜场馆状态。
3. **未发指令**：编排自标 `not_attempted`（顺序短路等），场馆无调用。

## 指令 → 回传

| 编排指令 | 场馆必须回传 | 备注 |
|----------|--------------|------|
| `checkBetting` | 有/无 `data` + 错误 | 失败也要回 |
| `betting` | `BetResult`（success/fail；PM 可 `pending`） | 未调用 → `not_attempted` |
| `settleArbLeg` / `resolveLegOutcome` | `VenueLegOutcome`：`filled` \| `unfilled` \| `timeout` + `orders` | 编排不改写判定 |

## Polymarket 三态（betting → settle）

| POST / BetResult | settle 行为 | 编排消费 |
|------------------|-------------|---------|
| API 失败 / FOK 未受理 | 不进 settle | `api_failed` |
| **fill confirmed**（`matched` + takingAmount>0） | **快路径**：直接 `filled`，不进 delayed poll；拉单 **一次** 供绑单 | 绑单 / 不成补单 |
| `pending` / delayed | settlement job → filled / unfilled / timeout | 未成交可补单 |

`[changmen 扩展]` fill confirmed 时编排入口可跳过无意义预拉（见 `resolveVenueLegOutcome`）。

## A8 场馆（OB / RAY / …）

`[A8 可证实]`：`venueRejectWaitBeforePoll(rejectWaitSec)` → 拉单 → `orders[0].status === "reject"` 视为 unfilled。  
本契约**不改**该语义。

## 相关代码

- 编排入口：`client/web/src/domain/betting/resolveVenueLegOutcome.ts`
- PM outcome：`client/venue-adapter/polymarket/legOutcome.ts`
- fill 判定：`isPolymarketBetResultFillConfirmed`（`orderStatus.ts`）
- A8 outcome：`client/venue-adapter/adaptation/a8LegOutcome.ts`
- 套利 settle：`settleBothArbLegs` → `settleArbLeg`
