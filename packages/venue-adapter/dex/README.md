# DexSport (Dex) 平台适配器

## 概述

DexSport 是 Web3 去中心化电竞博彩平台。Sportsbook 部分由第三方 SDK 提供，通过 iframe 嵌入 dexsport.io。

changmen 对接的是 Sportsbook API（`prod.dexsport.work`），不是 DexSport 主站 API。

## 架构

```
┌─────────────────────────────────────────────────────┐
│  changmen 前端 (client/web)                          │
│                                                     │
│  ┌──────────────┐    ┌──────────────────────────┐  │
│  │ HTTP 轮询     │    │ WebSocket 实时推送         │  │
│  │ 10s 周期      │    │ wss://prod.dexsport.work  │  │
│  │ directGet()  │    │ 游客 JWT 认证              │  │
│  └──────┬───────┘    └──────────┬───────────────┘  │
│         │                       │                   │
│         ▼                       ▼                   │
│  saveMatch + saveBets     oddsStore.save()          │
│  (写 RDS 数据库)          (写内存，实时更新 UI)       │
│                                 │                   │
│                           每 5 分钟                  │
│                           flushWsBets()             │
│                                 │                   │
│                           saveBets → RDS            │
└─────────────────────────────────────────────────────┘
```

## 数据流

### HTTP 轮询（赛事 + Match Winner）

```
每 10 秒:
  GET /api/line/top-events/{slug}?cid=ta-dexsport&locale=zh
  → 解析赛事列表 → saveMatch (写 platform_matches)
  → 解析内嵌 markets → saveBets (写 platform_bets)
  → oddsStore.save() (更新 UI)
```

公开端点，不需要认证。只返回 Match Winner (Map 0) 盘口。

### WebSocket 实时推送（所有地图赢家）

```
连接:
  POST /public/api/profile {guest:true, apiKey:"ta-dexsport"} → JWT
  new WebSocket("wss://prod.dexsport.work/ws?cid=ta-dexsport&token={JWT}")

层级订阅:
  ["join", "discipline", ["dota2", "csgo", ...]]
    ← batch: discipline 数据，含 tournamentIds
  ["join", "tournament", tournamentIds]
    ← batch: tournament 数据，含 eventIds
  ["join", "event", eventIds]
    ← batch: event 数据，含 marketIds
  ["join", "market", marketIds]  (全量订阅)
    ← batch: market 数据，含 outcomes (赔率)
```

收到 market 数据后按名字过滤（`/winner|赢家|获胜/`），只处理赢家类盘口。

### 赔率更新策略

| 来源 | 频率 | 盘口范围 | 写 oddsStore | 写 RDS |
|------|------|---------|-------------|--------|
| HTTP 轮询 | 10s | Map 0 (Match Winner) | 即时 | 即时 |
| WS 推送 | 实时 | Map 0/1/2/3 (所有赢家) | 即时 | 每 5 分钟 |

### WS 增量推送处理

WS 赔率变化时可能只发 1 个 outcome（不是完整的 2 个）。使用 `marketCache` 缓存每个 market 的 home/away 两端：

- 收到任一 outcome → 立即 oddsStore.save() 更新 UI
- home + away 都有缓存 → 组装完整 bet 放入 pendingSave
- 每 5 分钟 flushWsBets → 批量 saveBets 写 RDS

## WS 协议

### 消息格式

发送: `[action, model, ids[]]`
- action: `"join"` | `"leave"` | `"rpc"`
- model: `"discipline"` | `"tournament"` | `"event"` | `"market"`
- ids: string[]

接收: `[type, payload, data?]`
- `["config", {...}]` — 初始配置
- `["batch", [[model, lid, action, data], ...]]` — 批量更新
- `["error", {code, message}]` — 错误

### batch item

```
[model, lid, action, data]
  model: "discipline" | "tournament" | "event" | "market"
  lid: 长 ID，如 "2.36986258.6a30076f2a033e5afe583a1a"
  action: 1=创建/全量, 2=增量
  data: 模型数据
```

### market 数据结构

```json
{
  "name": "Winner. Map 2",
  "id": "6a300a266163d830dce2a9e4",
  "pid": "2.36986272",
  "outcomes": [
    {"id": "...", "name": "Power Rangers", "price": 1.91, "isFrozen": false, "identity": 101},
    {"id": "...", "name": "L1ga Team",     "price": 1.78, "isFrozen": false, "identity": 103}
  ]
}
```

- `price` = 赔率
- `isFrozen` = 是否锁定
- `identity`: 101 = home, 103 = away

### 认证

游客模式即可（不需要用户登录）:
```
POST https://prod.dexsport.work/public/api/profile
Body: { guest: true, apiKey: "ta-dexsport" }
→ { token: "eyJhbG..." }
```

JWT 每 8 分钟自动刷新。

## 关键常量

| 常量 | 值 | 说明 |
|------|------|------|
| API Base | `https://prod.dexsport.work` | Sportsbook API |
| WS Host | `wss://prod.dexsport.work/ws` | WebSocket |
| CID | `ta-dexsport` | Partner ID |
| 轮询间隔 | 10s | HTTP polling |
| WS flush | 5min | saveBets 批量写入 |
| JWT 刷新 | 8min | 游客 token 续期 |
| WS 重连 | 5s | 断线后重连延迟 |

## 游戏映射

| DexSport slug | changmen code | 游戏 |
|---------------|---------------|------|
| dota2 | dota2 | DOTA2 |
| csgo | csgo | CS2 |
| lol | lol | 英雄联盟 |
| valorant | valorant | 无畏契约 |
| king-of-glory | king-of-glory | 王者荣耀 |

## 文件结构

```
dex/
├── index.ts      — dexAdapter 注册 (id:"Dex", collector + provider)
├── collect.ts    — 采集器: HTTP 轮询 + WS batch handler
├── socket.ts     — WS 连接管理: 游客JWT/连接/重连/层级订阅/状态回调
├── parse.ts      — 数据解析: top-events → matches/bets, market name → map number
├── pluginApi.ts  — Chrome 扩展通信 (下注用)
└── bet.ts        — 下注: getBalance/checkBet/betting
```

## 与 Chrome 扩展的关系

| 功能 | 需要扩展？ | 说明 |
|------|-----------|------|
| 采集赛事 | 否 | HTTP 直连公开 API |
| WS 实时赔率 | 否 | 游客 JWT 认证 |
| 下注 | 是 | 需要用户的 sportsbookToken |
| 余额查询 | 是 | 需要用户认证 |

扩展在 dexsport.io 页面提取用户凭证:
- `hash` — 从 `/v3/address_info` 响应拦截
- `network` / `currency` — 从 localStorage 读取
- sportsbookToken = `{hash}_{network}_{currency}_sportsbook`

## odds_history

Dex 平台暂时跳过 `odds_history` 写入（`platform_collector_store.js` 中按 provider 跳过），减少 RDS 连接压力。
