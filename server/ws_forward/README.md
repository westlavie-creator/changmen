# ws_forward

平台实时 WebSocket **转发**：浏览器连 CHANGMEN，服务端代连官方上游（可设正确 `Origin` / `Authorization`），再双向 pipe。

## 路由

| 平台 | 传输 | 浏览器 path | 上游 |
|------|------|-------------|------|
| IA | Socket.IO | `/esport/ws-forward/IA` | `wss://socket.ajj123.net`（`/socket.io`，`Origin: ilustre`） |
| OB | raw WebSocket (MQTT) | `/esport/ws-forward/OB?u=<官方 wss>` | query `u` 指定的 OB demo MQTT wss |
| RAY | raw WebSocket (SocketCluster) | `/esport/ws-forward/RAY` | `wss://cfsocket.365raylinks.com/socketcluster/`（服务端注入 `Origin` + `Authorization`） |
| PM-MARKET | **hub**（合并订阅） | `/esport/ws-forward/PM-MARKET` | 独立进程 `changmen-pm-market-hub` `:3457` → `wss://ws-subscriptions-clob.polymarket.com/ws/market` |
| PM-USER | raw WebSocket | `/esport/ws-forward/PM-USER` | `wss://ws-subscriptions-clob.polymarket.com/ws/user`（仍在 esport） |
| PREDICTFUN-MARKET | **hub**（合并订阅） | `/esport/ws-forward/PREDICTFUN-MARKET` | 独立进程 `changmen-predictfun-market-hub` `:3458` → `wss://ws.predict.fun/ws`（`PREDICT_FUN_API_KEY` 握手） |

**PM-MARKET hub**：所有浏览器仍连 changmen 同一路径；服务端维护 **一条** 上游 MARKET WS，合并全站 `asset_id` 订阅后再 fan-out。客户端协议不变（`polymarketMarketSubscribeMessage` + `PING`）。无在线客户端 60s 后关闭上游。

**PREDICTFUN-MARKET hub**：浏览器仍发 `{ method: "subscribe", params: ["predictOrderbook/{marketId}"] }`；服务端合并全站 marketId，单条上游连 Predict.fun，上游 heartbeat 由 hub 代答。无在线客户端 60s 后关闭上游。

esport 默认 `WS_FORWARD_PLATFORMS` **不含** `PM-MARKET` / `PREDICTFUN-MARKET`（避免扇出拖死 HTTP）。本地：`npm run pm-market-hub` / `npm run predictfun-market-hub`。

Vite dev：HTTP 走 `5274/esport` 代理；**实时 WS 直连** `http://127.0.0.1:3560`（Vite 不代理 upgrade）。

## 客户端 failover

| 平台 | 顺序 |
|------|------|
| IA | official → changmen → a8 |
| OB | demo → changmen → a8（a8 失败后刷新 demo login） |
| RAY | official → changmen → a8 |

## 扩展新平台

1. 在 `platforms/` 增加定义（`socket.io` 或 `raw-ws`）
2. `registerPlatformForward` 注册
3. 在 `server/backend/server.js` 的 `attachWsForward` 增加平台 id
4. 在 `venue-adapter` 增加 `changmen` 出口与 failover

## 测试

```bat
npm test --workspace=@changmen/ws-forward
```
