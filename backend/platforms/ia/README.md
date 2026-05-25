# IA 平台

A8 采集模式：**HTTP + Socket.IO WebSocket**（插件 HTTP + `/esport/ws/IA/` 房间）。

## 数据流

```text
HTTP  GET  {gateway}/api/game/game/gameListPageSplit/     (header: token)
HTTP  POST {gateway}/api/game/game/getPointsListSplit
WS    wss://47.115.75.57/esport/ws/IA  RoomJoin: room_type_index_content_push
```

## 环境变量

| 变量 | 说明 |
|------|------|
| `ENABLE_IA=1` | 启用 IA Feed |
| `IA_GATEWAY` | 默认 `https://ilustre-analytics.org` |
| `IA_TOKEN` | 插件 token（HTTP header `token`） |
| `IA_BET_NAME` | 选盘正则，默认与 A8 一致 |
| `IA_GAME_IDS` | 可选，默认 catalog 中 IA game_type_id |
| `IA_WS=0` | 关闭 Socket.IO 增量 |
| `IA_WS_URL` / `A8_WS_URL` | WS 基址，默认 `wss://47.115.75.57` |

## 启动

```powershell
$env:ENABLE_IA = "1"
$env:IA_GATEWAY = "https://ilustre-analytics.org"
$env:IA_TOKEN = "your-token"
npm run web
```

CLI：`npm run ia:events`

页面：`http://localhost:3456/platforms/ia/`
