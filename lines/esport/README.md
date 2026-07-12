# lines/esport — 电竞产品线

**状态**：active（全栈，当前默认业务线）

实现代码仍在 **monorepo 根目录**（未物理迁入本目录）。组件映射见 [line.json](./line.json)。

| 组件 | 实际路径 |
|------|----------|
| 控制台 | `client/web/` |
| 场馆 adapter | `client/venue-adapter/` |
| API + 代理 | `server/backend/` |
| 合并 | `server/matcher/`、`server/match-engine/`、`server/team-resolver/` |
| PM Sports WS | `server/polymarket-sports/` |
| Predict.fun daemon | `server/predictfun-collector/` |

生产 PM2：`changmen-esport`、`changmen-pm-sports`、`changmen-predictfun-collector`。

详见 [docs/SPORTS_PRODUCT_LINES.md](../../docs/SPORTS_PRODUCT_LINES.md)。
