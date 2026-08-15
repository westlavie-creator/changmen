# predictfun-collector (`@changmen/predictfun-collector`)

VPS 守护进程：Predict.fun **REST discovery（唯一权威）** → `platform_matches` / `platform_bets` + 本机 `predictfun_market_index.json`。解析见本包 `parse.js`（含 `buildPredictMappedMarket`）。

浏览器 Predict.fun 采集器经 Market WS 收 orderbook，hub 展开为 token 买价写 `fo`（对齐 Polymarket）；**不经** http-relay 打 discovery，也**不**在 adapter 内镜像 discovery。Index 仅映射/种子。

## 运行

| 环境 | 命令 |
|------|------|
| 开发 | 仓库根 `npm run predictfun-collector` |
| 生产 PM2 | `changmen-predictfun-collector`（ecosystem 已注册，**默认随 deploy 与 PM collector 同启**） |

必需 env：

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | RDS |
| `PREDICT_FUN_API_KEY` | 主网 API（与 VPS `sync-hk-relay-env-remote.sh` / 前端 `VITE_PREDICT_FUN_API_KEY` 一致） |

可选：

| 变量 | 说明 |
|------|------|
| `PREDICTFUN_COLLECTOR_INTERVAL_MS` | 默认 **15s**（加快列表赔率；可用环境变量覆盖） |
| `PREDICTFUN_COLLECTOR_FUTURE_MS` | 采集未来窗；**默认 1h**（与 Polymarket 一致） |
| `PREDICTFUN_COLLECTOR_PAST_MS` | 采集过去窗；**默认 6h**（与 Polymarket 主 pass 一致） |

Discovery 按 `tagIds=83`（Esports）拉取 `ESPORTS_LOL` / `ESPORTS_CS2` 等；**不再**默认 `SPORTS_TEAM_MATCH`（那是 MLB）。过滤后 0 条时**不 clear** `platform_*`。

**结束门控（源头）**：`category.status` 赛后常仍为 `OPEN`。当全场 **Match Winner** 为 `PRICE_PROPOSED` / `RESOLVED` / `SETTLED`（或 `tradingStatus=CLOSED`）时**停写**并 `prunePredictFunPlatformMatches`，避免已结束场继续喂合场。

本机同步 key：`node scripts/sync/sync-predictfun-key-remote.mjs <host>`。

## 数据流

```
api.predict.fun REST（loop.js / parse.js）
  → platform_matches / platform_bets（RDS）
  → predictfun_market_index.json（storage）
```

与 `changmen-esport` 内嵌 matcher 的 `matchMerge` 共用 `platform_*` 表；浏览器侧 WS 仍走 `server/ws_forward`。

索引：[collectors/README.md](../README.md) · [deploy/README.md](../../../deploy/README.md)（relay / PM2）
