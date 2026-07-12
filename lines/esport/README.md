# lines/esport — 电竞产品线

**状态**：active（全栈，当前默认业务线）

实现代码仍在 **monorepo 根目录**（未物理迁入本目录）。组件映射见 [line.json](./line.json)。

| 组件 | `line.json` 键 | 实际路径 |
|------|----------------|----------|
| 控制台 | `web` | `client/web/` |
| 场馆 adapter | `venueAdapter` | `client/venue-adapter/` |
| API + 代理 + ws-forward 挂载 | `api` | `server/backend/` |
| 合并调度 | `matcher` | `server/matcher/` |
| 合并算法 | `matchEngine` | `server/match-engine/` |
| 队名解析 | `teamResolver` | `server/team-resolver/` |
| 正 EV 扫描 | `valueBet` | `server/value-bet/` |
| Socket.IO 推送 | `realtimeHub` | `server/realtime-hub/` |
| WebSocket 转发库 | `wsForward` | `server/ws_forward/` |
| PM Sports WS | `collectors[0]` | `server/collectors/polymarket-sports/` |
| Predict.fun daemon | `collectors[1]` | `server/collectors/predictfun-collector/` |

**能力**（`capabilities`）：`arbitrage`、`value-scan`、`match-merge`

生产 PM2：`changmen-esport`、`changmen-pm-sports`；`changmen-predictfun-collector` 在 ecosystem 中注册但**默认不启动**。

详见 [docs/SPORTS_PRODUCT_LINES.md](../../docs/SPORTS_PRODUCT_LINES.md)。
