# predictfun-collector (`@changmen/predictfun-collector`)

VPS 守护进程：Predict.fun **REST discovery** → `platform_matches` / `platform_bets` + 本机 `predictfun_market_index.json`。

浏览器 Predict.fun 采集器仅经 `ws-forward` 订阅 orderbook 写 `fo`；**不经** http-relay 打 discovery。

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
| `PREDICTFUN_COLLECTOR_FUTURE_MS` | 采集未来窗；**当前临时默认 12h**（`43200000`）；恢复 A8 对齐时设 `3600000` |

Discovery 按 `tagIds=83`（Esports）拉取 `ESPORTS_LOL` / `ESPORTS_CS2` 等；**不再**默认 `SPORTS_TEAM_MATCH`（那是 MLB）。过滤后 0 条时**不 clear** `platform_*`。

本机同步 key：`node scripts/sync/sync-predictfun-key-remote.mjs <host>`。

## 数据流

```
api.predict.fun REST（loop.js / parse.js）
  → platform_matches / platform_bets（RDS）
  → predictfun_market_index.json（storage）
```

与 `changmen-esport` 内嵌 matcher 的 `matchMerge` 共用 `platform_*` 表；浏览器侧 WS 仍走 `server/ws_forward`。

索引：[collectors/README.md](../README.md) · [deploy/README.md](../../../deploy/README.md)（relay / PM2）
