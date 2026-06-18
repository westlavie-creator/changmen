# IA 平台（Node 探针）

A8 采集：**HTTP（Zn）+ Socket.IO WebSocket**（扩展 HTTP + `/esport/ws/IA/` 房间）。

浏览器主实现与文档见：

- `client/platform-adapter/ia/`
- `client/web/docs/platforms/IA.md`

## 数据流（A8 对齐）

```text
HTTP  GET  {gateway}/api/game/game/gameListPageSplit/     (header: token，采集可为空)
HTTP  POST {gateway}/api/game/game/getPointsListSplit
WS    wss://47.115.75.57/esport/ws/IA  RoomJoin: room_type_index_content_push
```

下注（`CYe`）走用户账号 `gateway`，经 `mr.post` → 无 proxyId 时 **Zn**，有 proxyId 时 **PROXY**。

## 环境变量

| 变量 | 说明 |
|------|------|
| `IA_GATEWAY` | 默认 `https://ilustre-analytics.org` |
| `IA_TOKEN` | HTTP header `token`（A8 采集为空字符串） |
| `IA_BET_NAME` | 选盘正则，默认与 A8 一致 |
| `IA_GAME_IDS` | 可选，默认 catalog 的 IA game_type_id |
| `IA_WS=0` | 关闭 Socket.IO 增量（仅 CLI 实验） |
| `IA_WS_URL` / `A8_WS_URL` | WS 基址，默认 `wss://47.115.75.57` |

## 启动（CLI）

```powershell
$env:IA_GATEWAY = "https://ilustre-analytics.org"
$env:IA_TOKEN = ""
cd changmen/devtools/platform-probes
npm run ia:events
```
