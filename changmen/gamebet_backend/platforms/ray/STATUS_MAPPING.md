# RAY 状态对照（HTTP）

站点：ray164.com → API 网关 `https://cfinfo.365raylinks.com/v2/`

## 比赛层

| 来源 | 字段 | Feed 输出 |
|------|------|-----------|
| `/v2/match` | `status`, `start_time`, `end_time` | `matchStatus.code` / `label` |
| `/v2/match` | `team[].score` | `score`（如 `1:0`） |
| `/v2/odds` | `start_time` + 当前时间 | 刷新 `isLive` / `liveStatus` |

`describeMatchStatus` 规则：

- `start_time <= now` 且未过 `end_time` → 进行中（`live`）
- `status === 2` → 强制视为进行中
- 否则按开赛时间区分未开赛 / 已结束

## 地图层（stage）

| API `match_stage` | stageId | 展示 |
|-------------------|---------|------|
| `final` | 0 | 全场 |
| `r1` … `r5` | 1 … 5 | 地图 N |

## 盘口层

选盘规则见 [`MARKETS.md`](../../MARKETS.md) / [`shared/market_catalog.json`](../../shared/market_catalog.json)（`match_winner` → RAY `group_name` 匹配 `^获胜者$`）。

| API 字段 | 含义 | Feed |
|----------|------|------|
| `group_name` | 玩法名 | 仅保留 catalog 中 RAY 规则命中的行 |
| `status === 1` | 可投注 | `winMarketStatus.label = 可投注` |
| `status === 4` | 关闭 | 跳过或锁盘 |
| 其它 status | 封盘 | `winLocked: true` |

## WebSocket（SocketCluster · RAY 源站）

- 端点：`wss://cfsocket.365raylinks.com/socketcluster/`（`RAY_WS_HOST` / `RAY_WS_PATH` 可覆盖）
- 订阅频道：`match`（`RAY_WS_CHANNEL`）
- 消息格式：

```json
{ "source": "odds", "odds": [{ "id": 73825398, "odds": "2.05", "status": 1, "match_id": 38386601 }] }
{ "source": "match", "match": { "id": 38386601, "status": 2 } }
```

- 仅更新 HTTP `/v2/odds` 已登记过的 `odds_id`
- `ray_feed.js` 在 `start()` 时尝试连接 WS（`RAY_WS=0` 关闭）；`status.ws === true` 表示已连上

**禁止** 连接 A8 聚合服务器 `47.115.75.57/esport/ws/RAY`（见 [A8_REFERENCE.md](../../A8_REFERENCE.md)）。

若 Node 环境对 cfsocket 握手失败，Feed 仍可通过 HTTP 轮询工作；需排查 Origin/Token 或等待源站协议文档。

## HTTP ↔ 前端 Dashboard

Feed snapshot 与 OB 对齐：

- `matches[].matchStatus`
- `matches[].stages[].stageStatus`（RAY 使用 `winMarketStatus` 作为 stage 锁盘态）
- `winHome` / `winAway` / `winLocked`
