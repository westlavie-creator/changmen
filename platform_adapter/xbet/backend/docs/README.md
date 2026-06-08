# XBet 平台

A8 采集模式：**聚合 WebSocket**（频道 `XBet` / `XBet:Score`）。

## 数据流

```text
A8 聚合 Socket.IO → join room XBet
赔率 key：{betId}:1（主） / {betId}:3（客）
比分：channel XBet:Score
```

## 启用

```powershell
$env:ENABLE_XBET = "1"
$env:A8_WS_URL = "https://47.115.75.57"
$env:A8_SOCKET_TOKEN = "..."
npm run web
```

页面：`http://localhost:3456/platforms/xbet/`
