# IA 平台

A8 采集模式�?*HTTP + Socket.IO WebSocket**（插�?HTTP + `/esport/ws/IA/` 房间）�?

## 数据�?

```text
HTTP  GET  {gateway}/api/game/game/gameListPageSplit/     (header: token)
HTTP  POST {gateway}/api/game/game/getPointsListSplit
WS    wss://47.115.75.57/esport/ws/IA  RoomJoin: room_type_index_content_push
```

## 环境变量

| 变量 | 说明 |
|------|------|
| `IA_GATEWAY` | 默认 `https://ilustre-analytics.org` |
| `IA_TOKEN` | 插件 token（HTTP header `token`�?|
| `IA_BET_NAME` | 选盘正则，默认与 A8 一�?|
| `IA_GAME_IDS` | 可选，默认 catalog �?IA game_type_id |
| `IA_WS=0` | 关闭 Socket.IO 增量（仅 CLI 实验�?|
| `IA_WS_URL` / `A8_WS_URL` | WS 基址，默�?`wss://47.115.75.57` |

`ENABLE_IA` 为历�?Dashboard Feed 开关，已无对应进程。生产采集在 `frontend/`（CollectConfig + 插件 token）�?

## 启动（CLI�?

```powershell
$env:IA_GATEWAY = "https://ilustre-analytics.org"
$env:IA_TOKEN = "your-token"
cd changmen/client/platform-adapter
npm run ia:events
```
