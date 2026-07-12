# ws_forward

平台实时 WebSocket **转发**：浏览器连 CHANGMEN，服务端代连官方上游（可设正确 `Origin` / `Authorization`），再双向 pipe。

## 路由

| 平台 | 传输 | 浏览器 path | 上游 |
|------|------|-------------|------|
| IA | Socket.IO | `/esport/ws-forward/IA` | `wss://socket.ajj123.net`（`/socket.io`，`Origin: ilustre`） |
| OB | raw WebSocket (MQTT) | `/esport/ws-forward/OB?u=<官方 wss>` | query `u` 指定的 OB demo MQTT wss |
| RAY | raw WebSocket (SocketCluster) | `/esport/ws-forward/RAY` | `wss://cfsocket.365raylinks.com/socketcluster/`（服务端注入 `Origin` + `Authorization`） |
| PM-MARKET | **hub**（合并订阅） | `/esport/ws-forward/PM-MARKET` | 单条上游 → `wss://ws-subscriptions-clob.polymarket.com/ws/market` |
| PM-USER | raw WebSocket | `/esport/ws-forward/PM-USER` | `wss://ws-subscriptions-clob.polymarket.com/ws/user` |

**PM-MARKET hub**：所有浏览器仍连 changmen 同一路径；服务端维护 **一条** 上游 MARKET WS，合并全站 `asset_id` 订阅后再 fan-out。客户端协议不变（`polymarketMarketSubscribeMessage` + `PING`）。无在线客户端 60s 后关闭上游。

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
