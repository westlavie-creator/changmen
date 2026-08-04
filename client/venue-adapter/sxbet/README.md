# SX Bet 平台适配器

对照官方文档：[docs.sx.bet](https://docs.sx.bet/llms.txt)（2026-07 核对）。

## 结论

SX Bet **有正式公开 API**，适合自动化：只读无需 key；下单用钱包私钥 EIP-712 签名；实时赔率用 API key 换 Centrifugo token。

## 官方对齐表

| 能力 | 官方 | changmen |
|------|------|----------|
| Base URL | `https://api.sx.bet` | `SXBET_API` |
| Chain / USDC | `4162` / `0x6629…050B` | 常量 + `GET /metadata` 覆盖 |
| 电竞 moneyline | sportId=`9`，type=`52`（12） | `fetchSxActiveEsportsMoneylineMarkets` |
| 最优赔率 | `GET /orders/odds/best` | `fetchSxBestOdds`（maker 视角 → taker 取反） |
| 实时最优价 | Centrifugo `best_odds:global` | `ws.ts`（需 API key） |
| 实时 token | `GET /user/realtime-token/api-key` + `X-Api-Key` | `fetchSxRealtimeToken` |
| 下单（taker） | `POST /orders/fill/v2` + EIP-712 | `fillSxOrder`（`orders.ts`） |
| 余额 | explorer `tokenbalance` | `fetchSxUsdcBalance` |
| 订单历史 | `GET /trades?bettor=` | `getOrders` |
| 最低 stake | 1 USDC | `MIN_STAKE_USDC = 1` |
| slippage | 0–100；pre-game 建议 0 | 默认 `0` |

## 下单路径（官方 taker）

1. `GET /orders/odds/best` → maker `percentageOdds`
2. `desiredOdds = 10^20 - oppositeMakerOdds`（taker 视角）
3. EIP-712 domain：`name=SX Bet`，`version`/`verifyingContract` 来自 `GET /metadata`
4. `POST /orders/fill/v2` → `PENDING`，再轮询 trades 至 `SUCCESS`/`FAILED`

账号 `token` JSON：`{ "privateKey": "0x…", "apiKey": "…" }`（apiKey 仅 WS）。

## 启用

`registry/manifest.json`：`collect: true`、`bet: true`、`implementation: "done"`。

采集页 CollectPlatform 需配置 API key（Token 或 Gateway）才能连 `best_odds`；无 key 时仍可 HTTP 轮询 best odds。

## 范围外（刻意不做）

- Maker `POST /orders/new`（挂单）
- Parlay RFQ
- 非电竞 / 非 type 52 盘口
