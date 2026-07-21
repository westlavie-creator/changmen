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
| `betting` | `BetResult`（success/fail；PM/PF 可 `pending`） | 未调用 → `not_attempted` |
| `settleArbLeg` / `resolveLegOutcome` | `VenueLegOutcome`：`filled` \| `unfilled` \| `timeout` + `orders` | 编排不改写判定 |

## Polymarket 三态（betting → settle）

| POST / BetResult | settle 行为 | 编排消费 |
|------------------|-------------|---------|
| API 失败 / FOK 未受理 | 不进 settle | `api_failed` |
| **fill confirmed**（`matched` + takingAmount>0） | **快路径**：直接 `filled`，不进 delayed poll；拉单 **一次** 供绑单 | 绑单 / 不成补单 |
| `pending` / delayed | settlement job → filled / unfilled / timeout | 见下表 |

官方 delay（[Order Lifecycle](https://docs.polymarket.com/concepts/order-lifecycle)）：体育盘 `delayed` = 异步 seconds-delay 窗；时长取 CLOB `GET /clob-markets/{condition_id}` 的 **`sd`**（秒）。轮询见 `buildPolymarketDelayedPollOpts(sd)`。

| settle | 含义 | 套利补单 |
|--------|------|----------|
| `filled` | 成交 | 不补 |
| `unfilled` | 确认未成交（FOK/unmatched/cancel） | **可补** |
| `timeout` | 仍待确认（delay/接口滞后） | **不补新单**；挂 `pendingPmOrderId` 由 jb 续查原单 |

`[changmen 扩展]` fill confirmed 时编排入口可跳过无意义预拉（见 `resolveVenueLegOutcome`）。
`isVenueLegConfirmedUnfilled` = 仅 `unfilled`；`isVenueLegRejected` 仍含 timeout（jb 须先查 pending）。

## PredictFun 三态（betting → settle）

官方依据：[Create order](https://dev.predict.fun/create-an-order-32534694e0)、[Get order by hash](https://dev.predict.fun/get-order-by-hash-25326901e0)、[OrderStatus](https://dev.predict.fun/orderstatus-14037508d0)、[OrderStatusFilter](https://dev.predict.fun/orderstatusfilter-14037509d0)、[predictWalletEvents](https://dev.predict.fun/subscription-topics-1915507m0)。

| 官方事实 | 编排含义 |
|----------|----------|
| `POST /v1/orders` 成功体仅 `code` / `orderId` / `orderHash`，**无** `status` | **无 PM 式 POST fill-confirmed**；`betting` 必须 `pending=true` |
| `OrderStatus` = `OPEN \| FILLED \| EXPIRED \| CANCELLED \| INVALIDATED` | `FILLED`→filled；`CANCELLED/EXPIRED/INVALIDATED`→unfilled；`OPEN`→timeout（仍待确认） |
| `GET /v1/orders` filter **仅** `OPEN\|FILLED` | 拒单不能靠列表猜，须 `GET …/{hash}` |
| house 下单：`MARKET` + `isFillOrKill` + `isMinAmountOut` | 受理 ≠ 成交；FOK 可能随后 CANCELLED |

| 确认信号 | settlement |
|----------|------------|
| wallet `orderNotAccepted` / `orderCancelled` / `orderExpired` / `orderTransactionFailed` | **unfilled**（可补） |
| wallet `orderTransactionSuccess`（+ REST 校正金额） | **filled** |
| wallet `orderAccepted` / `orderTransactionSubmitted` | 继续等 |
| REST `FILLED` / 拒单终态 / 仍 `OPEN` 到时限 | filled / unfilled / **timeout** |

编排门控（与 PM 同消费面，`isPendingConfirmVenueProvider`）：

- `confirmPmPost` / `deferPmSettlement` / `rejectWait=0` 对 PredictFun 生效
- `betGateway`：仅 `!deferPmSettlement` 时后台 settle（双腿套利防双 settle）
- timeout：**不补新单**；挂 `pendingPmOrderId`（字段复用）由 jb / `arbMakeUpFromRejects` 续查原单

确认实现：VPS `predictWalletEvents` **优先**（`orderNotAccepted` 快拒不打 REST；`orderTransactionSuccess` 先 REST 校正金额再 stub）；`fetchHousePredictOrderResolved` / `waitForHouseOrderTerminal` / `Pf_GetOrder` REST 兜底。客户端 confirm 轮询前密后疏（有 hint 首轮收束）。勿依赖列表 filter 判拒。

## A8 场馆（OB / RAY / …）

`[A8 可证实]`：`venueRejectWaitBeforePoll(rejectWaitSec)` → 拉单 → `orders[0].status === "reject"` 视为 unfilled。  
本契约**不改**该语义。

## 相关代码

- 编排入口：`client/web/src/domain/betting/resolveVenueLegOutcome.ts`
- PM outcome：`client/venue-adapter/polymarket/legOutcome.ts`
- PF outcome：`client/venue-adapter/predictfun/legOutcome.ts`
- fill 判定：`isPolymarketBetResultFillConfirmed`（`orderStatus.ts`）
- 门控：`isPendingConfirmVenueProvider`（`packages/shared/account_multiply.ts`）
- A8 outcome：`client/venue-adapter/adaptation/a8LegOutcome.ts`
- 套利 settle：`settleBothArbLegs` → `settleArbLeg`
