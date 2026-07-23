# account/order

`order_store.js` 的落库合并拆分目录。对外符号仍从 `order_store.js` re-export。

## 入口

| 符号 | 作用 |
|------|------|
| `saveOrder` | 写库循环：prefetch → link → **mergeOrderLogicalSave** → upsert |
| `mergeOrderLogicalSave` | 三平行分发（旧名 `mergePolymarketLogicalSave`，已废弃不留别名） |

## 文件

| 文件 | 职责 |
|------|------|
| `dto.js` | `rowToOrder` / `scrubClientOrder` / `toClientOrder` / holdShares |
| `date_key.js` | 日键 |
| `kinds.js` | 买/卖判定、卖单不计笔数 |
| `link.js` | 卖单跟买单 Link、归账日并入、`findOrderRowById`（大小写不敏感） |
| `save_pm.js` | `mergePolymarketProviderSave` — 仅 Polymarket |
| `save_pf.js` | `mergePredictFunLogicalSave` — 仅 PredictFun |
| `save_non_pm.js` | 场馆/其它 + 非 PM 共用 raw 保留 |
| `position_events.js` | Phase 1 仓位 `positionEvents.sells` 缺省保留 + 按 id 幂等 |

## 约定

- **PredictFun**：浏览器不经 `Client_SaveOrder`；权威写经 `upsertPfServerOrder` → `saveOrder(..., "PredictFun")`。
- **本单 orderId**：读 prev 与 prefetch 均大小写不敏感；若命中已有行，upsert 主键用**库内** `order_id`，避免 PG 大小写敏感冲突键插出重复行。
- **仓位卖出事件**：写在买单 `raw.positionEvents.sells[]`；`mergeOrderLogicalSave` 缺省保留、按 sell id 幂等；卖单行剥掉该字段。Phase 1 仍双写独立卖单行，盈亏不以事件重算。
- 勿与合场 `matchMerge` 混淆：这里是订单字段合并，不是多馆比赛合成。
