# SX Bet 平台适配器

对照官方文档：[docs.sx.bet](https://docs.sx.bet/llms.txt)。

## 结论

SX Bet **有正式公开 API**。**Discovery 由 VPS** `@changmen/sxbet-collector` 独占写 `platform_*` + MarketIndex；浏览器只做 Index → Centrifugo → `fo` 与 EIP-712 下单。

## 官方对齐表

| 能力 | 官方 | changmen |
|------|------|----------|
| Base URL | `https://api.sx.bet` | `SXBET_API` |
| Chain / USDC | `4162` / `0x6629…050B` | 常量 + `GET /metadata` 覆盖 |
| 电竞 moneyline discovery | sportId=`9`，type=`52` | **VPS** `sxbet-collector` |
| 最优赔率种子 | `GET /orders/odds/best` | VPS → Index / platform_bets |
| 实时最优价 | Centrifugo `best_odds:global` | 浏览器 `ws.ts`（需 API key） |
| 下单（taker） | `POST /orders/fill/v2` + EIP-712 | `fillSxOrder`（`orders.ts`） |

## 启用

`registry/manifest.json`：`collectionMode: "vps_http_ws"`、`collect: true`。

VPS：
- `npm run sxbet-collector` / PM2 `changmen-sxbet-collector`（REST → platform_*）
- `npm run sxbet-market-hub` / PM2 `changmen-sxbet-market-hub`（Centrifugo → 浏览器；需 `SXBET_API_KEY`）

浏览器**不**需要 CollectPlatform apiKey；实时赔率走 `/esport/ws-forward/SXBET-MARKET`。

## 范围外（刻意不做）

- Maker `POST /orders/new`（挂单）
- Parlay RFQ
- 非电竞 / 非 type 52 盘口
- 浏览器 discovery / SaveMatch（已迁 VPS）
