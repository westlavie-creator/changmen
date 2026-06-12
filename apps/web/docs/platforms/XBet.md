# XBet 采集

## 入口

`xbet/index.ts` → `startA8BetsCollector`

## 配置

| 项 | 值 |
|----|-----|
| 频道 | `XBet` |
| homeSuffix | `"1"` |
| awaySuffix | `"3"`（对齐 A8 **KQe**，非 IM 的 `2`） |

## 额外频道

`XBet:Score` — 比分推送，当前仅 `console.debug`（可扩展写入 timer/score store）。

## 行为

与 [A8.md](./A8.md) / [IM.md](./IM.md) 相同 accumulator；无独立 HTTP 列表。

## A8 对照

`KQe` — 主客赔率 suffix 1/3。
