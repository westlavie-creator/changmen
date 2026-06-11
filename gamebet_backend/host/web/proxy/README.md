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
| `ENABLE_ESPORT_PROXY` | 默认开启；设为 `0` 关闭 |
| `ENABLE_OB_MQTT_RELAY` | 默认开启 `/esport/ws/OB`；设为 `0` 关闭 |
| `OB_PROXY_MQTT_USER` / `OB_PROXY_MQTT_PASS` | 下游 MQTT 认证（默认 admin / Qazqaz123...） |
| `OB_PROXY_ALLOW_ANY` | 设为 `1` 时跳过 MQTT 认证 |
| `RAY_TOKEN` / `RAY_ORIGIN` | RAY 源站凭据 |

## 验证

```bash
node proxy/ws_smoke_test.js
```

检查 `/api/proxy/status` 中 `upstreamConnected` 与 `messagesRelayed`。

## 前端

patch 后的 UI bundle 通过 `ws://127.0.0.1:3456/esport/ws/OB` 等连接本 relay；业务 API 走 `/esport/`。

启动：`npm run web`（会先执行 `patch:ui`）。
