# PredictFun 套利：卖一 × 倍数缓冲（方案）

- 状态：**已实施**（默认关 = 裸限价；已删除硬编码 30bps）
- 性质：**[changmen 扩展]**
- 日期：2026-09-03

---

## 架构（改根基，不改上层）

与 [PM_ARB_PRICE_BUFFER_PLAN.md](./PM_ARB_PRICE_BUFFER_PLAN.md) 同形、**独立**配置 `pfArbPriceBuffer`。

**要改的是「读出来的 PF 欧赔」**：`oddsStore.getOdds`（扫描 / 建腿 / 展示都读它）。

```text
fo 始终真价：clobPrice=卖一，odds=trunc3(1/卖一)
        │
        ▼ getOdds
  关 / 无 fo：真赔
  开且有 fo：trunc3(1/(卖一×倍数))
```

预检：`attachPredictFunDetectionQuote` 开时锁 `execCap`；`resolvePredictFunDetectionMaxPrice` = 裸 raw（**无** 30bps）。

官方 `slippageBps`（签 MARKET 数量滑点）**不在本方案范围**。

---

## 产品

| | 内容 |
|--|------|
| 看见 / 扫描 / 对冲 | `getOdds` 的 effectiveOdds |
| 执行限价 | attach 写入的 `卖一×倍数`；关 = 裸卖一 / `1/odds` |
| 结算 | 真实成交价 |
| 默认 | 关；倍数 `1.01` |

---

## 相对旧行为

- 删除 `PF_DETECTION_MAX_PRICE_BUFFER_BPS` / `applyPredictFunExecMaxPriceBuffer`
- **默认关比旧现网更严**（不再静默 +0.3%/+1 tick）；需要余量时打开倍数缓冲

---

## 代码落点

| 文件 | 角色 |
|------|------|
| `oddsStore.getOdds` | PF 唯一读赔变换（关 = trunc3 真赔） |
| `pfArbPriceBufferMode.ts` | 公式 + runtime |
| `extensionPrefs` + 扩展 Tab | `pfArbPriceBuffer` |
| `attachPredictFunDetectionQuote` | 开：锁 execCap |
| BetRow / useBetRowArbUi | 仅 `void` 配置以便重算 |

---

## 验收

- [ ] 关：PF getOdds 真赔；预检限价 = 裸 raw（无 30bps）；PM / 其它馆不变
- [ ] 开且有 fo：格子、扫描、建腿打折；限价 = 卖一×倍数
- [ ] 开但无 fo：真赔
- [ ] 结算不用 effective
