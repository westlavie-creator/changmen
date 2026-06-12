# IM 平台

A8 采集模式：**聚合 WebSocket**（公共 Socket.IO 频道 `IM`）。

## 数据流

```text
A8 聚合 Socket.IO → join room IM → chat message channel=IM
赔率 key：{betId}:1（主） / {betId}:2（客）
```

## 启用

```powershell
$env:ENABLE_IM = "1"
$env:A8_WS_URL = "https://47.115.75.57"   # 可选
$env:A8_SOCKET_TOKEN = "..."            # 可选，对应 A8 localStorage Hg
npm run web
```

页面：`http://localhost:3456/platforms/im/`

## 说明

IM 无独立源站 HTTP 比赛列表，比赛与赔率由 A8 聚合层推送。需 A8 侧已有 IM 账户在跑采集。
