# TF 平台

A8 采集模式：**HTTP events 快照 + 专用 WebSocket**（与 RAY 类似）。

参考项目根目录 [readme.md](../../readme.md) 第 9 节。

## 数据流

```text
HTTP  {gateway}/api/v8/events/  →  今日比赛列表 + 按 event_id 拉全场/地图盘口
WS    wss://ws…/esport/ws/TF    →  赔率增量（market_id:selection.name）
```

## 凭证

环境变量或 `scripts/data/esport/platforms.json`：

| 变量 | 说明 |
|------|------|
| `TF_GATEWAY` | 如 `https://api-v4.tf-api-rr3h.com` |
| `TF_TOKEN` | `Token …`（插件采集的 auth_token） |
| `TF_BET_NAME` | 可选，盘口名正则，默认 `(独赢\|获胜者)` |
| `ENABLE_TF=1` | 启动 TfFeed |

请求头与 A8 一致：`Authorization` + `tf-authorization`（见 `tf_auth.js`）。

## 启用

```powershell
$env:ENABLE_TF = "1"
$env:TF_GATEWAY = "https://api-v4.tf-api-rr3h.com"
$env:TF_TOKEN = "Token …"
npm run web
```

页面：`http://localhost:3456/platforms/tf/`

## 调试

```powershell
node scripts/platforms/tf/fetch_tf_events.js
```

## 文件

| 文件 | 作用 |
|------|------|
| `tf_auth.js` | `tf-authorization` 签名 |
| `tf_session.js` | HTTP /events |
| `tf_core.js` | 比赛/盘口归一化、WS 合并 |
| `tf_ws.js` | WebSocket 客户端 |
| `tf_feed.js` | FeedHub 接入 |
| `tf_game_ids.json` | TF game_id ↔ catalog code |

本地 WS 隧道：`scripts/proxy/tf_ws_relay.js`（Dashboard `/esport/ws/TF`）。
