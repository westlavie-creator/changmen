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

主前端与各平台 adapter **浏览器直连** 源站或 A8 聚合机（`47.115.75.57`），**不经** 本机 WS 网关。

`/api/proxy/status` 固定返回 `{ enabled: false, wsRelay: false }`。
