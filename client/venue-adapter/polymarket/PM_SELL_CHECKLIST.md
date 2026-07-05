# Polymarket 卖出功能 — 后期加回 Checklist

> **现状（2026-07）**：changmen **不做卖出**；只 BUY FOK → 持有至 Gamma 结算。  
> **本文**：后期重新启用 changmen 平仓时的设计备忘，避免再现 NRG 类 `open + full attr` 挡 Gamma 问题。

---

## 1. 产品规则（加功能前先定死）

| 决策项 | 待选 | 备注 |
|--------|------|------|
| 卖出触发 | 手动平仓 UI / 条件单 / 套利腿失败减仓 | 与 A8 无对照，纯 changmen 扩展 |
| 可卖份额 | `resolvePmRemainingShares` = fill − attributed | 与 `pmShares`（原始成交份数）分离 |
| 部分卖出 | 支持 / 仅全卖 | 影响 `pmSellState`: `partial` vs `closed` |
| 卖光后买单 | 盈亏在卖单行 vs 仍等 Gamma | 现逻辑倾向：**卖光 → 不再写 Gamma 到买单** |
| 官网手动卖 changmen 仓位 | 归因到 changmen 买单 / 忽略 | **现况：changmen 买单不参与 external reconcile** |
| 卖出限价 | 市价 FOK / 限价 GTC | 买入已用 FOK + detectionMaxPrice 思路可类比 |
| 与套利关系 | 独立平仓 vs arb 失败自动减仓 | 建议第一期只做独立手动平仓 |

---

## 2. 现有可复用代码（勿删）

| 模块 | 路径 | 状态 |
|------|------|------|
| SELL POST 解析 | `orders.ts` → `parsePolymarketSellOrderFill` | 有单测 |
| SELL 成交确认 | `resolvePolymarketSellFill` / `WithRetry` | 有 |
| 卖单 VenueOrder 映射 | `mapPolymarketSellTradeToVenueOrder` | CLOB sync 已在用 |
| external 买卖 reconcile | `reconcileExternalPolymarketOrders` | **会设** `pmSellState` partial/closed |
| changmen 卖单 merge | `mergeChangmenStoredWithClob`（sell 分支） | RDS + CLOB 合并骨架在 |
| 卖出估价 | `parse.ts` → `estimatePolymarketSellProceedsUsdc` | 预检深度用 |
| Server 卖单保存 | `order_store.js` → `mergePolymarketLogicalSave` sell 分支 | 有 |
| 持仓判断 | `pmLogicalPosition.ts` | `hasOpenPolymarketPosition` 等 |
| Gamma 挡闸 | `changmenSoldOutBlocksGammaSettlement` | 含 `open+full attr` 例外（NRG 兜底） |

### 未接线（后期二选一：接线 or 删）

| 函数 | 问题 |
|------|------|
| `applyPolymarketExternalSellDeduction` | 只增 `pmAttributedSellShares`，**不设** `pmSellState` — finalize **未调用** |
| `warnPolymarketPositionDrift` | 无生产调用方 |

---

## 3. 必须新建 / 补全

### 3.1 下单（venue-adapter）

- [ ] `bet.ts`：`betting` 增加 `side: SELL` 分支（现仅 `Side.BUY`）
- [ ] SELL 预检：`checkBet` 读 **bids** 深度 + min size（买入读 asks）
- [ ] SELL FOK / 限价体：`createPolymarketOrderBody` 传 `Side.SELL`
- [ ] 卖出 stake 语义：份数 vs USDC proceeds — 与 `pmStake` 对齐文档
- [ ] delayed / User WS：卖单同样需 `condition_id`（`option.betId`）
- [ ] `markPolymarketChangmenOrder` + `pmOrigin: changmen` + `pmSide: sell`

### 3.2 卖单写 RDS（原子字段）

卖单成交 persist 时 **同一事务** 写齐：

```text
卖单行:
  pmSide=sell, pmOrigin=changmen, pmBuyOrderId=<买单 orderId>
  pmShares, pmFillPrice, betMoney(proceeds USDC→display CNY)
  pmStakeUsdc=<对应买单成本 USDC>, pmRealizedPnlUsdc, money

买单行（同步更新）:
  pmAttributedSellShares += sharesSold
  pmSellState = remaining > 0 ? "partial" : "closed"
  pmStakeUsdc 按份额比例扣减（与 reconcileExternal 768-769 行一致）
```

**禁止**：只写 `pmAttributedSellShares` 而不更新 `pmSellState`（NRG 根因）。

### 3.3 finalize / sync

- [ ] `reconcilePolymarketBuySellOrders`：changmen 卖单纳入匹配（现 changmen 买单被 **排除** 在 external reconcile 外）
- [ ] 或：卖单 persist 时已写归因，finalize 以 RDS 为准、reconcile 仅校验
- [ ] `finalizePolymarketVenueOrders`：决定 `applyPolymarketExternalSellDeduction` 去留
- [ ] `mergeChangmenStoredWithClob`：卖光买单 `blockGammaSettlement` 行为与产品规则一致
- [x] `getOrders` 与 RDS merge **统一**（`fetchPolymarketVenueOrdersMerged` + `registerPolymarketStoredVenueOrdersLoader`）

### 3.4 Server

- [ ] `order_store.js`：镜像 client `changmenSoldOutBlocksGammaSettlement`（含 `open+full attr` 例外）
- [ ] 汇率：去掉硬编码 `×7`，改 `@changmen/shared/account_multiply`
- [ ] `backfill-polymarket-order-settlement.mjs`：卖光买单跳过 Gamma；与 client 闸一致

### 3.5 前端

- [ ] 平仓入口 UI（份额、预估回款、当前 bid 深度）
- [ ] `orderLink.ts` / `pmOrderDisplay.ts`：按需展示卖单行（现 **过滤** `PmSide=sell`）
- [ ] 订单组盈亏：`computeOrderGroupProfit` 已 skip sell — 确认卖光场景展示
- [ ] `hasOpenPolymarketPosition` / 未结余额：卖后份额减少正确反映
- [ ] 修复 `pmShares≈0` 仍判 open 的误判（与卖出无关但影响平仓前展示）

### 3.6 钱层

- [ ] 卖出 UI 输入 CNY 计划额 or 份数 — 定义 Plan CNY 边界（可扩 `a8VenueMoney`）
- [ ] proceeds / cost / PnL 展示口径与 `resolveDisplayCnyFromVenueUsdc` 一致

---

## 4. 测试清单（加功能时必绿）

| 场景 | 参考 |
|------|------|
| 全卖 changmen 买单 | attr=fill, state=closed, 买单不再 Gamma settle |
| 部分卖 | state=partial, 剩余份额 Gamma 仍可结算 |
| 卖单 delayed → 确认 | `venueRejectSync` / `settlePolymarketDelayedOrder` |
| 卖单 POST matched | `parsePolymarketSellOrderFill` |
| persist 后 sync  round-trip | RDS attr/state 不被 CLOB merge 覆盖错 |
| `open+full attr` 历史行 | `orders.test.ts` L710 NRG 回归 |
| Server save | `order_store_link.test.mjs` sell/buy 配对 |
| 订单列表 | 买单+卖单同 Link 分组（`orderStore.test.ts`） |

---

## 5. 已知历史事故（勿再现）

**NRG Academy（2026-07-05）**

```text
pmAttributedSellShares = 36（已满）
pmSellState = open（未更新）
→ changmenSoldOutBlocksGammaSettlement 旧逻辑挡 Gamma
→ status 卡 None，需 manual-fix SQL / mjs
```

**修复态**：client `changmenSoldOutBlocksGammaSettlement` 已对 `open+full attr` 放行；  
**后期卖出**：应从写入源头保证 state 同步，而非只靠例外兜底。

---

## 6. 建议实施顺序

```text
1. 产品规则签字（§1）
2. bet.ts SELL 预检 + 下单 + POST 解析
3. persist 卖单 + 更新买单 attr/state（§3.2）
4. finalize / sync 统一（§3.3）
5. server order_store 对齐（§3.4）
6. UI + 订单展示（§3.5）
7. 全量单测 + 一笔小额实盘验证
8. 清理死代码或正式接线 applyPolymarketExternalSellDeduction
```

---

## 7. 现阶段（无卖出）维护原则

- **不要**为卖出归因修生产路径；纯买入 Gamma 结算已够用。
- **保留** §2 所列模块与单测，避免后期从零写。
- **可选**：历史卡单用 `manual-fix-pm-order-by-prefix.mjs`（`--dry-run` 先行）。
- **优先**投入检测/下单速度（与卖出无关）：主循环并发、Gamma guard 缓存、SDK 预热、discovery 间隔。

---

## 8. 相关文件索引

```
changmen/client/venue-adapter/polymarket/
  bet.ts              # 现仅 BUY；后期加 SELL
  orders.ts           # reconcile / Gamma 闸 / sell 映射
  pmLogicalPosition.ts
  pmStake.ts
  parse.ts            # estimatePolymarketSellProceedsUsdc

changmen/client/venue-adapter/adaptation/a8VenueMoney.ts

changmen/client/web/src/
  shared/orderLink.ts       # 过滤卖单行
  shared/pmOrderDisplay.ts
  stores/account/polymarketVenueSync.ts

changmen/server/backend/core/account/order_store.js
changmen/server/backend/core/integrations/polymarket/settlement.js
changmen/server/backend/scripts/backfill-polymarket-order-settlement.mjs
```
