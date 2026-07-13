# @changmen/realtime-hub

**Socket.IO** 实时 hub：服务端 ↔ 浏览器。由 **`changmen-esport`（backend）进程内嵌挂载**，非独立 PM2。

## 能力

| 能力 | 事件 / 路径 | 用途 |
|------|-------------|------|
| **pub/sub** | `pubsub:subscribe` / `pubsub:publish` / `pubsub:message` | BetTarget、Publish、USER:*、TRADE:*（对齐 A8 GoEasy 频道语义） |
| **服务端推送** | `emitPubSubMessage` | pm_sport 等 collector → 浏览器 |
| **鉴权** | 握手 `auth.token` / `headers.token` | 与 esport JWT 一致 |

## 数据流

```text
浏览器 A ──pubsub:publish(BetTarget)──► backend realtime-hub ──► 浏览器 B
changmen-pm-sports ──HTTP notify──► backend ──emit(Polymarket:PmSport)──► 浏览器
```

## 导出

| 符号 | 用途 |
|------|------|
| `attachChangmenRealtimeHub` | backend HTTP server 挂载 |
| `pushPmSportToBrowsers` | 推送单场 pm_sport |
| `PM_SPORT_CHANNEL` | 频道名常量 |

客户端：`@changmen/venue-adapter/shared` → `subscribeChangmenChannel` / `publishChangmenChannel` / `ensureChangmenHubConnected`。

前端 BetTarget/操盘：`client/web/src/realtime/pubsubClient.ts`（自研 hub 适配层；频道名对齐 A8 bundle，不经 GoEasy SaaS）。

## 测试

```bat
npm test --prefix server/realtime-hub
```

相关：[server/collectors/README.md](../collectors/README.md) · [server/ws_forward/README.md](../ws_forward/README.md)
