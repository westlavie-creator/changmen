# Polymarket 套利：卖一 × 倍数缓冲（方案）

- 状态：**配置 + 读赔根基已实施**（默认关 = `getOdds` 走 A8 原路径）
- 性质：**[changmen 扩展]**
- 日期：2026-08-20

---

## 架构（改根基，不改上层）

**不要**在 BetRow / `buildOrderOptions` / `pickArbLegs` / `bet.ts` 各打一遍折扣。

**要改的是「读出来的 PM 欧赔」这一层**：`oddsStore.getOdds`（`ViewBetItem.getOdds` / 扫描 / 建腿 / 手动单都读它）。

```text
fo 始终真价：clobPrice=卖一，odds=trunc3(1/卖一)
        │
        ▼ getOdds
  关 / 无 fo：真赔（A8）
  开且有 fo：trunc3(1/(卖一×倍数))   ← 展示/扫描/建腿/FOK 都读这一档
```

无 fo（棒/足体育盘不写 fo）就没有打折档，继续真价。不改写入，结算仍用成交价。

FOK：核心 `bet.ts` **不改**。开关开时 `option.odds` 已是 effective；`attachDetectionQuote` 把 `detectionMaxPrice` 写成 execCap（否则 fo 卖一与打折赔率对不上档）。这是预检锁价适配，不是改下单算法。

---

## 产品

| | 内容 |
|--|------|
| 看见 / 扫描 / 对冲 | `getOdds` 的 effectiveOdds |
| FOK 上限 | attach 写入的 `卖一×倍数`；顶档够深仍可按卖一成交 |
| 结算 | 真实成交价 + fee |
| 默认 | 关；倍数 `1.01` |

例：`0.886 × 1.01 → cap 0.8949 → 赔率 1.117`

---

## 代码落点

| 文件 | 角色 |
|------|------|
| `oddsStore.getOdds` | **唯一读赔变换**（关 = 原实现） |
| `pmArbPriceBufferMode.ts` | 公式 + runtime |
| `extensionPrefs` + 扩展 Tab | 配置 |
| `attachDetectionQuote` | 开：锁 execCap（配合打折后的 `option.odds`） |
| BetRow / useBetRowArbUi | 仅 `void` 配置以便保存后重算；**不改赔率公式** |

---

## 验收

- [ ] 关：PM getOdds / 套利 / FOK 与现网一致
- [ ] 开且有 fo：格子、扫描、建腿均为打折档；FOK cap = 卖一×倍数
- [ ] 开但无 fo：真赔，不打折
- [ ] 结算不用 effective
