# @changmen/realtime-hub

**Socket.IO** 推送 hub：服务端 → 浏览器实时（`pm_sport` 比分等）。由 **`changmen-esport`（backend）进程内嵌挂载**，非独立 PM2。

## 数据流

```text
changmen-pm-sports (collector)
    │ 写 client_matches.pm_sport + HTTP notify
    ▼
backend 内嵌 realtime-hub
    │  Socket.IO /esport/realtime
    ▼
client/web（pmSportRealtime）
```

## 导出

| 符号 | 用途 |
|------|------|
| `attachChangmenRealtimeHub` | backend HTTP server 挂载 |
| `pushPmSportToBrowsers` | 推送单场 pm_sport |
| `PM_SPORT_CHANNEL` | 频道名常量 |

依赖 `@changmen/polymarket-sports/parse_sport.js` 做 snapshot 对齐。

## 测试

```bat
npm test --prefix server/realtime-hub
```

相关：[server/collectors/README.md](../collectors/README.md) · [server/ws_forward/README.md](../ws_forward/README.md)
