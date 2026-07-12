# polymarket-sports (`@changmen/polymarket-sports`)

VPS 守护进程：Polymarket **Sports API WebSocket** → RDS `client_matches.pm_sport` 列。

**不替代**浏览器 CLOB 赔率采集（`client/venue-adapter/polymarket/`）与 `saveMatch` / `saveBets` 上报。

## 运行

| 环境 | 命令 |
|------|------|
| 开发 | 仓库根 `npm run pm-sports` |
| 生产 PM2 | `changmen-pm-sports`（`deploy/ecosystem.config.cjs`，cwd 本目录） |

依赖：`DATABASE_URL`（`@changmen/db`）、`@changmen/storage/load_env`。

## 数据流

```
wss://sports-api.polymarket.com/ws
  → resolve_match（platform_matches 已有 Polymarket 行）
  → updateClientMatchPmSport
  → broadcast_notify → realtime-hub（浏览器 pm_sport 推送）
```

电竞场若不在 Sports WS 推送范围内，由 `gamma_poll.js` 按 Gamma 轮询补充。

## 模块

| 文件 | 职责 |
|------|------|
| `index.js` | WS 连接、重连、主循环 |
| `gamma_map.js` | Gamma event 索引 |
| `gamma_poll.js` | 已关联场轮询 |
| `resolve_match.js` | `gameId` / slug → `client_match_id` |
| `parse_sport.js` | Sports WS 消息解析 |

探针：`scripts/probe-sports-ws.mjs`、`scripts/compare-ws-gamma.mjs`。

索引：[collectors/README.md](../README.md) · [lines/esport/line.json](../../../lines/esport/line.json)
