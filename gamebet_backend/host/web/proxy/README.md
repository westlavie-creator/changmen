# Esport WebSocket 代理

本机充当多平台 WebSocket 聚合层，**upstream 仍直连各平台源站**，禁止连接远程聚合 relay。

## 路径

| 路径 | 平台 | 说明 |
|------|------|------|
| `/esport/ws/OB` | OB | MQTT over WebSocket（aedes relay → 源站 MQTT） |
| `/esport/ws/RAY` | RAY | SocketCluster relay |
| `/esport/ws/TF` | TF | 隧道 stub（需 `ENABLE_TF=1`） |

## 环境变量

| 变量 | 说明 |
|------|------|
| `ENABLE_ESPORT_PROXY` | **默认关闭**；设为 `1` 开启本机 `/esport/ws/*` 网关 |
| `ENABLE_OB_MQTT_RELAY` | `ENABLE_ESPORT_PROXY=1` 时默认开启 `/esport/ws/OB`；设为 `0` 关闭 |
| `OB_PROXY_MQTT_USER` / `OB_PROXY_MQTT_PASS` | 下游 MQTT 认证（默认 admin / Qazqaz123...） |
| `OB_PROXY_ALLOW_ANY` | 设为 `1` 时跳过 MQTT 认证 |
| `RAY_TOKEN` / `RAY_ORIGIN` | RAY 源站凭据 |

## 验证

```bash
node proxy/ws_smoke_test.js
```

检查 `/api/proxy/status` 中 `upstreamConnected` 与 `messagesRelayed`。

## 前端

changmen Vue 主前端 **不经过** 本网关（OB/RAY/TF/IA 均浏览器直连源站或 A8 聚合机）。

仅在使用旧 `/console/` bundle（`PATCH_CONSOLE=1` + `npm run patch:ui`）或 `ws_smoke_test.js` 时需要 `ENABLE_ESPORT_PROXY=1`。
