# Polymarket 卖出 / 卖单依附买单 — Checklist

> **状态（2026-07-21）**：手动卖出 + 卖单依附买单 **已落地**（`[changmen 扩展]`，无 A8 对照）。  
> 本文件分三块：**已落地** / **已取消** / **仍待办**。勿再按「无卖出」维护生产路径。

---

## 0. 产品口径（已定）

| 项 | 定案 |
|----|------|
| 触发 | 侧栏未结买单行「卖出」→ 手动平仓；**不做**止盈 GTC / 条件单 |
| 可卖份额 | `resolvePmRemainingShares` = fill − `pmAttributedSellShares` |
| 部分卖 | **支持** → `pmSellState`: `partial` / `closed`（卖光） |
| 下单 | 当前买单剩余份额 **FOK 吃 bids**；不撤其它挂单 |
| 依附字段 | 卖单 `pmBuyOrderId`；买单 `pmAttributedSellShares` + `pmSellState` + **`pmSellProceeds`（回款真相 USDC，对标 PF）** |
| 盈亏 | **记在买单 `money`**；卖单 `money` 恒 0（回款在 `betMoney`，成本/PnL 在 raw） |
| 卖光后 | 倾向挡 Gamma 纸面结算（`changmenSoldOutBlocksGammaSettlement`；含 `open+full attr` 历史兜底） |
| 展示 | 方案 A **软附属**：`orderListDisplayBlocks` 嵌在买单下；不改落库；卖单行回款仍读自身 `BetMoney`（旧单无 `pmSellProceeds` 不影响） |
| 归账日 | 卖单跟父买单 `CreateAt`；后端 `mergePredictionBuySellSiblings` 跨日并入 |
| 官网卖 changmen 仓 | **不归因**（changmen 买单不进 external reconcile；仅侧栏手动卖写绑定） |
| 卖出预检 UI | **不做**（手动卖仅简单确认份额后下单；深度校验在 FOK 下单时） |

PF 同源语义见 `predictfun/README.md`（1:1 全卖、`pfBuyOrderId`、盈亏在买单）。

---

## 1. 已落地

### 1.1 Adapter

- [x] `pmManualSell.ts`：FOK 卖当前买单剩余份额；同批写卖单 + patch 买单
- [x] 卖单：`pmSide=sell`、`pmOrigin=changmen`、`pmBuyOrderId`、`money=0`
- [x] 买单：累加 `pmAttributedSellShares`、`pmSellState`、累加已实现 `money` / `pmSellProceeds`（首次卖丢弃纸面 win/lose）
- [x] `orders.ts`：external reconcile 可设 `pmBuyOrderId` / `pmSellState`（官网卖路径）
- [x] `pmLogicalPosition.ts`：剩余份额 / 持仓判断
- [x] SELL POST 解析 / fill 确认 / VenueOrder 映射（CLOB sync 在用）
- [x] 回款真相对齐 PF：买单 `pmSellProceeds`；读路径 `resolvePmSellProceedsUsdc` 优先买单、旧单兜底卖单 `BetMoney`；**侧栏卖单展示仍读自身 BetMoney**

> **说明**：手动卖走 `pmManualSell`，**不是** `bet.ts` 通用 `Side.SELL` 分支。§仍待办里的「bet.ts SELL」仅在要做预检深度 UI / 通用下注路径时才需要。

### 1.2 Server

- [x] `order_store.js`：卖单 Link 强制跟父买单；`mergeOrderLogicalSave` → PM sell 分支
- [x] `mergePredictionBuySellSiblings` + `fetchPredictionSellsByBuyOrderIds`：跨日 sibling
- [x] `getOrders` / RDS merge 统一（`fetchPolymarketVenueOrdersMerged`）

### 1.3 Frontend

- [x] 侧栏「卖出」：`stores/account/pmManualSell.ts` + `OrderList.vue`（`allowPmSell`；embedded 管理端默认关）
- [x] 落库失败防双卖：session `persistBlocked`
- [x] `orderLink.ts`：软附属、`alignPredictionSellLinksToBuys`、归账日、`polymarketMoneyForAggregate`（防双计）
- [x] `pmOrderDisplay.ts`：买卖标签 / 盈亏展示口径

### 1.4 测试与巡检

| 场景 | 参考 |
|------|------|
| 买卖 patch / delayed | `pmManualSell.test.ts`、`pmManualSell.delayed.test.ts` |
| Link / 跨日 / 组盈亏 | `order_store_link.test.mjs`、`orderLink.test.ts` |
| reconcile / NRG 闸 | `orders.test.ts` |
| 只读巡检 | `scripts/ops/diagnostics/audit-order-sidebar-health.mjs` |
| 双计扫修 | `scripts/ops/incidents/scan-fix-pm-sell-pnl-double.mjs`（先 `--dry-run`） |
| 历史迁移 | `migrate-pm-sell-pnl-to-buy.mjs` 等 |

**巡检基线（2026-07-21，近 30 天）**：`pm_money_2x_sell_pnl` / 买卖双计 / 孤儿卖单 = 0；残留 high 仅 `pm_sold_out_but_stake_left`（stake 未扣干净，另案）。

---

## 2. 已取消（止盈 GTC）

- [x] 扩展页「PM卖单」入口已移除
- [x] prefs 字段 `pmAutoExitSell` 已删除（历史存档键忽略）
- [x] `pmAutoExitSell.ts` / settlementJob·bet 钩子 / `pickPolymarketAutoExitSellPrice` **已删除**
- [x] 卖出路径不撤挂单、失败不回挂

手动卖出见 `pmManualSell.ts`（侧栏按钮），与止盈无关。

---

## 3. 仍待办

### 3.1 死代码决策（P1）

| 项 | 动作 |
|----|------|
| ~~`pmAutoExitSell*`~~ | **已删（2026-07-21）** |
| ~~`applyPolymarketExternalSellDeduction` / `applyPolymarketNetPositions` / `aggregatePolymarketSellSharesByAsset`~~ | **已删（2026-07-22）** — 未接线且不设 `pmSellState`，勿半吊子接回 |
| ~~`warnPolymarketPositionDrift`~~ | **已删（2026-07-22）** |
| `pmHeartbeat` | 保留；文件头注明暂无生产调用 |

### 3.2 产品待决后再写码（P2）

| 决策项 | 定案 |
|--------|------|
| 官网手动卖 changmen 仓 | **不归因**（已锁定；勿接线半成品 FIFO 扣减） |
| 卖出预检 UI | **不做**（手动卖仅简单确认） |
| 通用 `bet.ts` SELL | 手动卖已够用；除非套利减仓要复用下注管线 |
| 与套利关系 | **已落地（扩展可选）**：`arbFailAutoSell` 失败减仓；`arbEarlyLockSell` 提前锁利（可卖价优于锁定利润） |
| PF 部分卖 | PF 仅 1:1；见 predictfun README |

### 3.3 Server / 运维边角（P2–P3）

- [x] 管理端订单列表复用 `enrichOrdersBelongingToDate` / `mergePredictionBuySellSiblings`（`listAdminOrders` + `listAdminOrdersMatrix`；多用户按 `user_id` 分桶）
- [x] backfill / manual-fix：CNY→USDC 兜底用 `getExchange(USDT)`（去掉硬编码 `/7`）
- [x] backfill：卖光买单跳过 Gamma（对齐 `changmenSoldOutBlocksGammaSettlement`）
- [x] 历史 `pm_sold_out_but_stake_left`：`scripts/ops/incidents/fix-pm-sold-out-stake-left.mjs`（先 `--dry-run`）
- [x] `tmp_fix_pf_sell_display.mjs` → `scripts/archive/fix-pf-order-display-labels.mjs`（文案修数，非卖出逻辑）

### 3.4 写入纪律

**禁止**只写 `pmAttributedSellShares` 而不更新 `pmSellState`（NRG 根因）。官网归因若重做，须同事务写 state，勿复活已删的「半扣减」函数。

---

## 4. 已知历史事故（勿再现）

**NRG Academy（2026-07-05）**

```text
pmAttributedSellShares = 36（已满）
pmSellState = open（未更新）
→ changmenSoldOutBlocksGammaSettlement 旧逻辑挡 Gamma
→ status 卡 None
```

**修复**：client 闸对 `open+full attr` 放行；**写入源头**必须 attr 与 state 同步。

**盈亏双计**：纸面 Win + 卖出 PnL → `money≈2×`；或买卖行同时有 `money`。  
读路径：`polymarketMoneyForAggregate` 兜底；写路径：盈亏只累买单；运维：`scan-fix-pm-sell-pnl-double.mjs`。

---

## 5. 相关文件索引

```
client/venue-adapter/polymarket/
  pmManualSell.ts          # 手动卖（主路径）
  orders.ts                # reconcile / Gamma 闸 / sell 映射
  pmLogicalPosition.ts
  parse.ts                 # estimatePolymarketSellProceedsUsdc

client/web/src/
  stores/account/pmManualSell.ts
  shared/orderLink.ts      # 软附属 / 归账 / 组盈亏
  shared/pmOrderDisplay.ts
  components/order/OrderList.vue

server/backend/core/account/order_store.js
server/db/rds/orders_store.js   # fetchPredictionSellsByBuyOrderIds
server/backend/scripts/ops/diagnostics/audit-order-sidebar-health.mjs
server/backend/scripts/ops/incidents/scan-fix-pm-sell-pnl-double.mjs

docs/ACCOUNT_BACKEND.md         # 买卖依附 + 盈亏口径摘要
client/venue-adapter/predictfun/README.md   # PF 卖出契约
```
