# predictfun-collector (`@changmen/predictfun-collector`)

VPS 守护进程：Predict.fun **REST discovery** → `platform_matches` / `platform_bets` + 本机 `predictfun_market_index.json`。

浏览器 Predict.fun 采集器仅经 `ws-forward` 订阅 orderbook 写 `fo`；**不经** http-relay 打 discovery。

## 运行

| 环境 | 命令 |
|------|------|
| 开发 | 仓库根 `npm run predictfun-collector` |
| 生产 PM2 | `changmen-predictfun-collector`（ecosystem 已注册，**默认 deploy 不启动**） |

必需 env：

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | RDS |
| `PREDICT_FUN_API_KEY` | 主网 API（与 VPS `sync-hk-relay-env-remote.sh` / 前端 `VITE_PREDICT_FUN_API_KEY` 一致） |

可选：`PREDICTFUN_COLLECTOR_INTERVAL_MS`（默认 60s）。

本机同步 key：`node scripts/sync/sync-predictfun-key-remote.mjs <host>`。

## 数据流

```
api.predict.fun REST（loop.js / parse.js）
  → platform_matches / platform_bets（RDS）
  → predictfun_market_index.json（storage）
```

与 `changmen-esport` 内嵌 matcher 的 `matchMerge` 共用 `platform_*` 表；浏览器侧 WS 仍走 `server/ws_forward`。

索引：[collectors/README.md](../README.md) · [deploy/README.md](../../../deploy/README.md)（relay / PM2）
