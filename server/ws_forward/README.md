# ws_forward

平台实时 WebSocket **转发**：浏览器连 CHANGMEN，服务端代连官方上游（可设正确 `Origin`），再双向转发 Socket.IO 事件。

## 路由

| 平台 | 浏览器 Socket.IO path | 上游 |
|------|----------------------|------|
| IA | `/esport/ws-forward/IA` | `wss://socket.ajj123.net`（`/socket.io`） |

Vite dev：HTTP 走 `5274/esport` 代理；**IA WebSocket 直连** `http://127.0.0.1:3560/esport/ws-forward/IA`（Vite 不代理 Socket.IO upgrade）。

## 扩展新平台

1. 在 `platforms/` 增加定义并实现 `buildUpstream`
2. `registerPlatformForward` 注册
3. 在 `platform-adapter` 增加 `changmen` 出口与 failover

## 测试

```bat
npm test --workspace=@changmen/ws-forward
```
