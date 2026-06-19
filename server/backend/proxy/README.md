# HTTP 代理

本目录提供各平台 **HTTP** 中继（无插件时 PB 等仍依赖），以及通用 `x-proxy-url` 转发。

## 模块

| 文件 | 说明 |
|------|------|
| `http_proxy_relay.js` | 通用 HTTP relay（`/esport/http-relay`） |
| `ob_http_proxy.js` | OB HTTP 代理 |
| `ray_http_proxy.js` | RAY HTTP 代理 |
| `pb_http_proxy.js` | PB HTTP 代理 |
| `ia_http_proxy.js` | IA HTTP 代理 |

## WebSocket

IA 等平台的 **CHANGMEN 出口** 经 `server/ws_forward/`（路径 `/esport/ws-forward/:platform`）：服务端代连官方上游后转发给浏览器。官方 / A8 出口仍为浏览器直连。

**dev**：IA WebSocket 直连 `http://127.0.0.1:3560`（不经 Vite 5274 代理）；HTTP 仍走 Vite `/esport` 代理。

`/api/proxy/status` 返回 `{ wsForward: true, platforms: ["IA", ...] }`（启用时）。
