# RAY 平台（雷竞技 / ray164.com）

前台站点：[https://ray164.com/](https://ray164.com/)

## 数据流

```text
HTTP  cfinfo.365raylinks.com/v2/match   →  比赛列表（内嵌 odds 不完整，勿用于建盘）
HTTP  cfinfo.365raylinks.com/v2/odds    →  单场完整盘口（全场 final + 各地图 r1…）
WS    cfsocket.365raylinks.com/socketcluster/  →  SocketCluster 频道 `match`（RAY 源站，非 A8）
```

**HTTP 建底表，WebSocket 增量覆盖赔率**（思路与 A8 采集类似；实现独立，不引用 `A8/index.js`，**不连接** A8 聚合服务器 `47.115.75.57`）。

Feed 默认 **30s HTTP 轮询**；若源站 WS 可用则自动订阅（`RAY_WS=0` 可仅 HTTP）。

## 环境变量

| 变量 | 说明 |
|------|------|
| `ENABLE_RAY` | 设为 `0` 关闭 RAY Feed（默认开启） |
| `RAY_WS` | 设为 `0` 关闭 WebSocket，仅 HTTP 轮询 |
| `RAY_TOKEN` | 可选 `Bearer ...`；WS 也可复用 |
| `RAY_WS_HOST` | 默认 `cfsocket.365raylinks.com` |
| `RAY_WS_PATH` | 默认 `/socketcluster/` |
| `RAY_WS_CHANNEL` | 默认 `match` |
| `RAY_ORIGIN` | 默认 `https://ray164.com` |
| `RAY_GAME_IDS` | 逗号分隔 RAY native game_id；**未设时**使用 [GAMES.md](../../GAMES.md) 聚合列表 |

## 文件

| 文件 | 作用 |
|------|------|
| `ray_session.js` | 网关探测、HTTP 请求 |
| `ray_core.js` | 比赛/盘口归一化、状态描述 |
| `ray_feed.js` | Dashboard Feed（与 OB snapshot 形状对齐） |
| `ray_ws.js` | SocketCluster 实时推送（RAY 源站 cfsocket） |
| `ray_game_ids.json` | 常见电竞 game_id |
| `fetch_ray_match.js` / `fetch_ray_odds.js` / `fetch_ray_ws.js` | CLI 调试 |

## 启动

```bash
cd scripts
npm run web
# http://localhost:3456  —  OB + RAY 同时展示
```

```bash
npm run ray:match
npm run ray:odds -- 38386601
npm run ray:ws
```

## 盘口规则

- 仅采集 [`MARKETS.md`](../../MARKETS.md) 中 **`match_winner`** 规则匹配的「获胜者」主盘（全场 `final` + 各地图 `r1`…）
- 盘口 `status === 1` 为可投；其它视为锁盘

详见 [STATUS_MAPPING.md](./STATUS_MAPPING.md)。
