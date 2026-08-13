# sxbet-collector (`@changmen/sxbet-collector`)

**场馆已暂停**：生产 deploy **不**启动本进程，并会 `pm2 delete changmen-sxbet-collector`。源码保留便于恢复。

VPS 守护进程：SX.bet **REST discovery（唯一权威）** → `platform_matches` / `platform_bets` + 本机 `sxbet_market_index.json`。解析见本包 `parse.js`（含 `buildSxMappedMarket`）。

浏览器 SXBet 采集器经 Centrifugo `best_odds:global` 写 `fo`；**不**跑 markets discovery，也**不** `SaveMatch`/`SaveBet`。Index 仅映射/种子。

## 运行

| 环境 | 命令 |
|------|------|
| 开发 | 仓库根 `npm run sxbet-collector` |
| 生产 PM2 | `changmen-sxbet-collector`（ecosystem 有条目；**当前默认不启**） |

必需 env：

| 变量 | 说明 |
|------|------|
| `DATABASE_URL`（或 PUBLIC/INTERNAL） | RDS |

可选：

| 变量 | 说明 |
|------|------|
| `SXBET_API_BASE` | 默认 `https://api.sx.bet` |
| `SXBET_COLLECTOR_INTERVAL_MS` | 默认 **60s** |
| `SXBET_COLLECTOR_FUTURE_MS` | 采集未来窗；默认 **1h**（与 Polymarket / PredictFun 一致） |
| `SXBET_COLLECTOR_PAST_MS` | 采集过去窗；默认 **6h** |

只读 REST **无需** API key。浏览器实时 WS 仍用 CollectPlatform 的 apiKey。

过滤后 0 条时**不 clear** `platform_*`。

## 数据流

```
api.sx.bet REST（loop.js / parse.js）
  → platform_matches / platform_bets（RDS）
  → sxbet_market_index.json（storage）
```

与 `changmen-esport` 内嵌 matcher 的 `matchMerge` 共用 `platform_*` 表。

索引：[collectors/README.md](../README.md) · [deploy/README.md](../../../deploy/README.md)
