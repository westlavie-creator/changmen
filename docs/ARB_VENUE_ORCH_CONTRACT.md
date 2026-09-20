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
| `settleArbLeg` / `resolveLegOutcome` | `VenueLegOutcome`：`filled` \| `unfilled` \| `timeout` + `orders` | 编排不改写判定。**PM 不回 `timeout`** |

## Polymarket 三态（betting → settle）

| POST / BetResult | settle 行为 | 编排消费 |
|------------------|-------------|---------|
| API 失败 / FOK 未受理 | 不进 settle | `api_failed` |
| **fill confirmed**（`matched` + takingAmount>0） | **快路径**：直接 `filled`，不进 delayed poll；拉单 **一次** 供绑单 | 绑单 / 不成补单 |
| `pending` / delayed | settlement job：等满官方 `sd` + 查询滞后后 **filled / unfilled** | 见下表 |

官方 delay（[Order Lifecycle](https://docs.polymarket.com/concepts/order-lifecycle)）：体育盘 `delayed` = 异步 seconds-delay 窗；时长取 CLOB `GET /clob-markets/{condition_id}` 的 **`sd`**（秒）。轮询见 `buildPolymarketDelayedPollOpts(sd)`：先等满 `sd`，再最多 `POLYMARKET_POST_DELAY_GET_LAG_MS`（2s，**[changmen 扩展]** GET 滞后，非官方第二段 delay）。窗内不可撤。窗后：撮合、校验失败 rejected，或 `unmatched` 挂簿。本仓库 FOK：**窗后无成交必须 `unfilled`（可撤则撤）**。官方无 `timeout` 态；poll 内部 timeout 经 `coercePolymarketFokPollOutcome` 收成 `unfilled`，**不得**回传编排 / 进行中订单。官方未规定缺省 `sd`：拉失败 / 无 `condition_id` / 行无 `sd` 时用保守上限 **30s**（`UNKNOWN_SPORTS_SECONDS_DELAY`），禁止默认 1s。Settlement Job 缺失时须复用下单时的 poll，或按 `pmConditionId` 再拉 `sd`。`delayed` / 查不到行（delay 窗内常见 404）须走 FOK grace，窗内不立刻 cancel。

| settle | 含义 | 套利补单 |
|--------|------|----------|
| `filled` | 成交 | 不补 |
| `unfilled` | 确认未成交（FOK 窗后无成交 / cancel） | **可补** |

`[changmen 扩展]` fill confirmed 时编排入口可跳过无意义预拉（见 `resolveVenueLegOutcome`）。
`isVenueLegConfirmedUnfilled` = 仅 `unfilled`。PM 进行中订单：delay 窗内「确认中」；窗后只显示已成交或拒单。编排层 `settleArbLeg` 若仍收到 PM `timeout`，按 `unfilled` 收，`pendingConfirm=false`（与 UI / 补单一致）。

## PredictFun 三态（betting → settle）

**模型**：受理后确认场馆（类 A8 + timeout 第三态），**不是** PM「POST 常已成交」。

官方依据：[Create order](https://dev.predict.fun/create-an-order-32534694e0)、[Get order by hash](https://dev.predict.fun/get-order-by-hash-25326901e0)、[OrderStatus](https://dev.predict.fun/orderstatus-14037508d0)、[OrderStatusFilter](https://dev.predict.fun/orderstatusfilter-14037509d0)、[predictWalletEvents](https://dev.predict.fun/subscription-topics-1915507m0)。

| 阶段 | 官方事实 | changmen 含义 |
|------|----------|----------------|
| 预检 | 限价 + FOK 深度 | 挡必挂单；**不保证成交** |
| **API 下单成功** | `POST /v1/orders` 返回 `orderId`（体无 `status`） | **仅**官网收下挂单；`success=true` + `pending=true`；placeOutcome=`accepted_pending_confirm` |
| 未受理 | 无 `orderId` / 抛错 | `api_failed`（不进 settle） |
| 成交 | `FILLED` / wallet `orderTransactionSuccess` | 唯一可当「成了」；成功计数 / 补单锚腿以 **filled** 为准；买单若 `feeRateBps>0` 且尚无 wallet fee，编排仍报 `timeout`（hold 未齐） |
| 拒单 | `CANCELLED` / `EXPIRED` / `INVALIDATED` | 与 A8 `reject` 同级 → `unfilled`，**可补** |
| 未决 | 仍 `OPEN` / 查不到 | `timeout`，**不补新单**；挂 `pendingVenueOrderId` 续查原单 |

| 官方细节 | 编排含义 |
|----------|----------|
| `GET /v1/orders` filter **仅** `OPEN\|FILLED` | 拒单不能靠列表猜，须 `GET …/{hash}`；套利/jb/手动 settle **必须** `confirmPostAccepted=true` |
| house：`MARKET` + `isFillOrKill` + `isMinAmountOut` | 受理 ≠ 成交；FOK 可能随后 CANCELLED（接受→取消为正规路径） |

| 确认信号 | settlement |
|----------|------------|
| wallet `orderNotAccepted` / `orderCancelled` / `orderExpired` / `orderTransactionFailed` | **unfilled**（可补） |
| wallet `orderTransactionSuccess`（+ REST 校正金额） | **filled** |
| wallet `orderAccepted` / `orderTransactionSubmitted` | 继续等 |
| REST `FILLED` / 拒单终态 / 仍 `OPEN` 到时限 | filled / unfilled / **timeout** |

编排门控（与 PM **同消费面**；命名为「受理后确认」，不再绑 PM）：

- `isPendingConfirmVenueProvider` / `confirmPostAccepted` / `deferPostAcceptSettlement` / `rejectWait=0` 对 PredictFun 生效
- `betGateway`：仅 `!deferPostAcceptSettlement` 时后台 settle（双腿套利防双 settle）
- `markArbSuccessLegs`：**仅 PF** 在仍 `pendingConfirm` 时不记成功（等 filled）；A8/PM 不变
- timeout：**不补新单**；jb / `arbMakeUpFromRejects` 续查原单（`pendingVenueOrderId`）

确认实现：VPS `predictWalletEvents` **优先**；`fetchHousePredictOrderResolved` / `waitForHouseOrderTerminal` / `Pf_GetOrder` REST 兜底。客户端 confirm 轮询前密后疏，总窗对齐服务端 sell 确认量级。勿依赖列表 filter 判拒。

与 A8 / PM 对照：

- **像 A8**：受理 ≠ 成交，必须事后确认
- **不像 A8**：确认靠 hash/`wallet`，不是长 `rejectWait` + 列表首条；多 timeout
- **不像 PM**：无 `matched` fill-confirmed 快路径

## 混合对（PM/PF + 即时馆）

**[changmen 扩展]** 检测价预检在 POST 前必须仍有效。

传统 A8↔A8：两边预检都是短 HTTP，冻价到 POST 落在 0.01 里。混合对里 PM/PF 预检要拉 CLOB `/book`，即时馆（RAY 等）若把第一次 `checkBet` 的冻价拿去 POST，会在等待里过期 → 场馆 **501**。

编排：

1. 双侧 `checkBetting` 仍须都过才进入 place（零 POST）。即时馆这次 `data` 作废，只证明当时可下。**例外见下「探测型 checkBet」**。
2. place：先确认 PM/PF 盘口仍在检测价内（fo 已高则直接放弃，不再拉簿）。不过：两侧 `not_attempted`。过：再用**扫描检测价**锁即时馆。两张单都就绪后 **同时 POST**（不按 `betSorting` 串行、不等即时馆 HTTP 回包）。套利 `betting` 禁止内联预检（无 quote 直接失败）。PM FOK 限价打在检测上限，复用刚拉的 `/book`，不再等另一腿回包后重拉。9999 只下即时馆时只再预检即时馆检测价。
3. 用户选 Serial 也对混合对并发 POST；A8↔A8 仍只在 Parallel 时并发。
4. 一边 API 失败另一边仍可能成交：补单入队逻辑不变。

### 探测型 checkBet（OB / TF）不得重锁

`venueCheckBetProbesBetEndpoint`（`@changmen/venue-adapter/shared`）标出 **checkBet 打真实下单端点** 的馆：OB `POST /game/bet` a=1 等回「Minimum」、TF `POST /single-bet/` odds=-0.05。它们的预检**本身就是一次注单提交**，同一注单连打两次会被场馆判重复提交（OB 回「请勿重复提交」并 `updateOdds(0)` 抹掉该选项 fo）。

因此混合对里：

| 即时馆 checkBet | 第一次 `data` | 临下单 |
|---|---|---|
| 报价型（RAY `/v2/odds`、IM/IMT GetBetInfo…） | 作废 | 按扫描检测价重锁（防 RAY 501 过期冻价） |
| **探测型（OB / TF）** | **保留** | **不再预检**，直接用冻价 POST（A8 freeze-and-POST）；冻价失效由场馆 POST 裁决（OB 回 `Odds error`） |

判定入口：`canRelockInstantQuote`（`mixedPendingConfirmPair.ts`），`checkArbLegs` 与 `placeArbLegs` 同源。**回归**：2026-09-16～17 一律重锁，OB 混合对因此第二次探测被判重复提交 → 两腿都 `not_attempted`（UI「未下单 · 检测价重锁失败（请勿重复提交）」），OB 只剩补单路径（`loseOrder=true` 跳过探测）能下出去。

PM `checkBet`：`GET /book` 与 Gamma 并行（官方 Place Orders 第一步即 `/book`）；两边都回才算预检成功。vps 下公开 `Pm_GetBook` 短超时（800ms）直连 CLOB，失败/超时回落 VPS；超时设 0 则不试直连。闸门再读 CLOB `/markets/{condition_id}` 的 `accepting_orders` / `closed`（CLOB `{error:"trading is disabled"}` 视为未受理，不标 `pmPosted`）。两套时钟：**HTTP 只等 POST ACK**（客户端 30s，VPS POST abort 20s，须覆盖 `/time`≤8s + ACK，禁止浏览器 15s 先切断）；**撮合等官方 `sd`**（`delayed` 回包后，见上表）。插件断连可同一次回落 VPS；timeout/Network Error **不**重试 POST。勿把 PF 60s 或 HTTP 60s 当成官方 delay。

## A8 场馆（OB / RAY / …）

`[A8 可证实]`：`venueRejectWaitBeforePoll(rejectWaitSec)` → 拉单 → `orders[0].status === "reject"` 视为 unfilled。  
本契约**不改**该语义。

## 相关代码

- 编排入口：`client/web/src/domain/betting/resolveVenueLegOutcome.ts`
- PM outcome：`packages/venue-adapter/polymarket/legOutcome.ts`
- PF outcome：`packages/venue-adapter/predictfun/legOutcome.ts`
- fill 判定：`isPolymarketBetResultFillConfirmed`（`orderStatus.ts`）
- 门控：`isPendingConfirmVenueProvider`（`packages/shared/account_multiply.ts`）
- A8 outcome：`packages/venue-adapter/adaptation/a8LegOutcome.ts`
- 套利 settle：`settleBothArbLegs` → `settleArbLeg`
- place 腿态：`ArbLegPlaceOutcome`（`accepted_pending_confirm` = PF 挂单待确认）
