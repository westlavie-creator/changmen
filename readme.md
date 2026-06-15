# gamebet — 多平台电竞赔率聚合（客户端 + 服务端）

> **与 A8 的关系**：A8（`api.a8.to`）是第三方聚合平台。上级目录 [`../A8/A8frontendscipts/`](../A8/A8frontendscipts/) 为参考 bundle，**仅供阅读逆向，禁止引用**。

## 项目共识

0. **架构：客户端 / 服务端**
   - **客户端**：Vue 控制台 + Chrome 插件 — 连接各博彩平台、采集、下注。
   - **服务端**：`server/backend` + RDS + `server/matcher` — 收数、合并、鉴权、订单。
   - 本仓库里的 `localhost` 与 `.bat` 是**开发联调**方式，不是产品形态「本地单机版」。

1. **changmen 服务端 API 由 A8 前端反推**
   无 A8 官方服务端源码。`Client_*` / `API_*` 等依据 A8 bundle 形状实现；存储与合并逻辑为 **[changmen 推测]**，parity 以 **A8 前端可证实行为** 为准。

2. **Parity 唯一基线**
   `A8/A8frontendscipts/2.0.1/index.js`（及 Network 抓包）。不是 changmen 的 Node Feed 或 JSON 文件布局。

3. **changmen 扩展（非 A8 bundle 内容）**
   matcher、`platform_sync` 启动登录、WS relay、`http-relay` 等。
   CollectConfig 与 A8 一致：**无默认全开**；以 `user_kv` / 用户中心开关为准。
   **已删除**：Node FeedHub、`ESPORT_BRIDGE`（2026-06）。

4. **数据采集（仅客户端）**

   客户端 `saveMatch` / `saveBet` → 服务端 API → RDS → matcher → `client_matches`。服务端不跑平台 Feed 采集。

5. **生产部署** — [PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md)

## 工作目录

**所有 `npm run`、`BAT\*.bat` 请在 `changmen/` 下执行**（本目录即应用根）。首次配置：运行 `BAT\setup-dev-env.bat` 从 `.env.example` 生成 `server/backend/.env`，编辑 `JWT_SECRET` 与 `DATABASE_URL`。

若 Git 仓库根仍是上一级的 `gamebet/`，可在该目录执行 `npm run web`（根目录 `package.json` 会转发 npm 脚本）；**`.bat` 请进入 `changmen/` 再双击**。说明见 [scripts/README.md](./scripts/README.md)。

## 数据职责

与 A8 `UMe` 一致：**浏览器**写列表与盘口 id，**fo** 写实时赔。

| 层级 | 负责内容 | 写入 |
|------|----------|------|
| 前端采集器 | 比赛列表 + 盘口 | `API_SaveMatch` / `API_SaveBet`（受 CollectConfig 控制） |
| matcher | 跨平台合并 | `client_matches` |
| 前端 `oddsStore` | 实时赔、锁盘 | 仅内存（对齐 A8 `fo`） |

「赛事采集」开关：仅控制是否 **回传** `SaveMatch`/`SaveBet`，不停止拉数或 fo。

启动：`BAT\setup-dev-env.bat`（首次）→ `BAT\dev.bat`（或 `BAT\dev.bat parity`）。详见 [BAT/README.md](./BAT/README.md)、[server/backend/README.md](./server/backend/README.md)。

## 仓库结构

| 目录 | 职责 |
|------|------|
| [`client/web/`](./client/web/) | **新控制台**（Vue 3 + Pinia）+ 参考 bundle、`/console/` 对照 |
| [`server/backend/`](./server/backend/) | **服务端**：esport-api、WS relay、静态托管 |
| [`server/matcher/`](./server/matcher/) | **服务端**：跨平台赛事合并（写 `client_matches`） |
| [`client/chrome-extension/`](./client/chrome-extension/) | Chrome 扩展（Gamebet 协议，代发 HTTP / v4 等） |
| [`client/platform-adapter/`](./client/platform-adapter/) | 各平台采集/下注（`frontend/` + `node/`） |
| [`packages/shared/`](./packages/shared/) · [`packages/api-contract/`](./packages/api-contract/) | 跨端工具与 HTTP 契约 |
| [`server/db/`](./server/db/) · [`server/match-engine/`](./server/match-engine/) 等 | 服务端库（RDS、合并算法、平台 node 等） |
| [`../A8/`](../A8/) | A8 原版参考（bundle + 官方插件拷贝，与 `changmen` 并列） |
| [`../pingtai_offical/`](../pingtai_offical/) | 各平台官网抓包参考（可选） |

```bash
cd changmen   # 若尚未在本目录
npm install          # workspaces：backend、matcher、web、packages
npm run web          # preweb + 启动 http://localhost:3560（Win）/ 3456
npm run app:dev      # 新控制台 dev → http://localhost:5174/
```

| 入口 | 说明 |
|------|------|
| `/` | **新控制台**；`npm run app:build` 或 dev `npm run app:dev` |
| `/console/` | 旧 bundle（可选：`PATCH_CONSOLE=1 npm run web`） |

**生产部署**：[PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md)

迁移阶段与模块对照见 [client/web/MIGRATION.md](./client/web/MIGRATION.md)。文档索引：[docs/README.md](./docs/README.md)。Monorepo 结构见 [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)。

**OB / RAY 与 A8 行为对照**（Token 获取、数据采集、下注）：[client/web/docs/platforms/A8_COMPARE_OB_RAY.md](./client/web/docs/platforms/A8_COMPARE_OB_RAY.md)。

**OB 复刻计划**（A8 前端基线 + changmen 标注）：[client/web/docs/A8_OB_REPLICATE_PLAN.md](./client/web/docs/A8_OB_REPLICATE_PLAN.md)。

**TF 与 A8 行为对照**（`Client_GetCollectPlatform`、form-urlencoded、`$3`/`ly` 头、30s HTTP + WS、下注）：[client/web/docs/platforms/A8_TF_LOGIC_PARITY.md](./client/web/docs/platforms/A8_TF_LOGIC_PARITY.md)。

平台采集 canonical 源码目录：`client/platform-adapter/{平台}/frontend/`（Vite 别名 `@platform`）。下文表格已按此路径更新；更深处历史章节若仍出现 `collectors/` 或旧名 `client/platform-adapter/` 请以本目录为准。

---

## 客户端采集（分工）

各平台采集在**客户端**完成，经 HTTP 上报服务端。

```text
client/platform-adapter（浏览器 @platform） ──► API_SaveMatch / API_SaveBet ──► 服务端 ──► RDS
服务端 matcher ──► client_matches ──► Client_GetMatchs ──► 客户端 matchStore
客户端 oddsStore（实时赔，对齐 A8 fo）
```

### 采集器一览

| 平台 | 源码 | 机制 | 凭证要求 |
|------|------|------|----------|
| OB | `client/platform-adapter/ob/frontend/collect.ts` | MQTT（`/esport/ws/OB`）+ HTTP `game/index` | `gateway` + `token` |
| RAY | `client/platform-adapter/ray/frontend/collect.ts` | SocketCluster + HTTP `/v2/match`、`/v2/odds` | `gateway` + `token`（API **强制** A8 写死凭证，见 `client/platform-adapter/ray/backend/collect_credentials.js`） |
| TF | `client/platform-adapter/tf/frontend/collect.ts` | WS `/esport/ws/TF` + HTTP `/api/v8/events` | `gateway` + `token` |
| IA | `client/platform-adapter/ia/frontend/collect.ts` | Socket.IO `/esport/ws/IA` + HTTP | `gateway` + `token` |
| PB | `client/platform-adapter/pb/frontend/collect.ts` | 5s 轮询 euro odds，60s 存盘 | `gateway` + 嵌套 JSON `token` |
| IMT | `client/platform-adapter/imt/frontend/collect.ts` | 60s 全量 + 1s delta | `gateway` + `token`（及 referer / x-sc 等） |
| SABA | `client/platform-adapter/saba/frontend/collect.ts` | 电竞页 HTML 解析 + SABA Socket.IO | `gateway` + 页面 path `token` |
| IM | `client/platform-adapter/im/frontend/collect.ts` | A8 聚合 Socket 频道 `IM` | `gateway`（`47.115.75.57`）；token 可选 |
| XBet | `client/platform-adapter/xbet/frontend/collect.ts` | A8 频道 `XBet` + `XBet:Score` | 同上 |
| Stake | `client/platform-adapter/stake/frontend/collect.ts` | GraphQL 快照 + A8 频道 `Stake` | `accessToken`（GraphQL `x-access-token`） |
| HG | `client/platform-adapter/hg/frontend/collect.ts` | **占位**（无标准电竞赔率流，对齐 A8 `SQ` 跟单） | 无采集凭证 |

公共模块：

| 模块 | 路径 | 说明 |
|------|------|------|
| 采集会话 | `client/platform-adapter/shared/collectSession.ts` | 优先平台账号（可要求有余额），回退 `Client_GetCollectPlatform` |
| HTTP 采集 | `client/web/src/shared/http.ts` | OB/RAY/TF/IA/IMT/PB/SABA/Stake 直连；CORS 失败走 relay / proxy |
| A8 Socket hub | `client/platform-adapter/shared/socket/hub.ts` | 共享 Socket.IO（`https://47.115.75.57`，header `token` = 控制台登录 token） |
| A8 盘口聚合 | `client/platform-adapter/shared/socket/collector.ts` | IM / XBet / Stake 的 `{ bets: [...] }` → oddsStore + saveMatch |

### 凭证存储：`server/backend/data/esport/platforms.json`

`Client_GetCollectPlatform` 读取该文件（RAY 除外，见上）。前端 `getCollectPlatform(provider)` 与 Node 探针脚本共用同一数据源。

**联调时已确认的配置状态**（2026-05，随环境变化，以审计脚本为准）：

| 平台 | platforms.json | 联调探针 |
|------|----------------|----------|
| OB | 有 gateway + token | `ob:probe-index` 正常（当日赛程 55+ 场） |
| RAY | 有条目但 API 用 A8 写死 JWT | `ray:match` 正常 |
| PB | 有 gateway + 长 JSON token | `fetch_pb_odds.js list` 正常；`balance` 曾失败（token 权限/过期） |
| IM / XBet | 有 gateway，token 空 | 设计如此；依赖 A8 Socket + 插件 |
| TF / IA / IMT / SABA / Stake | **无条目** | CLI 报「缺少凭证」，采集器会跳过 |
| HG | 无条目 | 占位，无需赔率凭证 |

HTTP 代理（浏览器 CORS 回退）：`/esport/ob/proxy`、`/esport/ray/proxy` 在凭证齐全时返回 200。

### 补全缺失平台凭证

任选其一：

1. **插件导入**（推荐）
   `cd server/backend && npm run account:import-platform -- <base64> --sync-store`

2. **环境变量**（启动时 `platform_sync.js` 写入 store）

   | 平台 | 变量 |
   |------|------|
   | TF | `TF_GATEWAY` + `TF_TOKEN` |
   | IA | `IA_GATEWAY` + `IA_TOKEN` |
   | IMT | `IMT_GATEWAY` + `IMT_TOKEN`（base64 JSON） |
   | SABA | `SABA_GATEWAY` + `SABA_TOKEN` |
   | Stake | `STAKE_ACCESS_TOKEN`（可选 `STAKE_API_URL`） |
   | IM / XBet | `A8_WS_URL`、`A8_SOCKET_TOKEN`（可选） |

3. **控制台 API** `API_UpdatePlatform` 写入 `gateway` / `token`。

平台账号另存于 `user_kv` 的 `ACCOUNT`；`resolveCollectSession` 会优先使用已登录且有余额的账号。

### 采集配置审计脚本

一键检查 `platforms.json`、`Client_GetCollectPlatform`、账号与可选 live 探针：

```bash
cd server/backend
npm run check:collect          # 配置 + API 对照
npm run check:collect:probe    # 额外 HTTP 探针（OB/RAY/PB 等）
npm run check:collect -- --json   # CI / 机器可读
```

- 脚本：`server/backend/scripts/check-collect-platforms.js`（`npm run check:collect`）
- 退出码 `0` = 所有**必需**凭证齐全；`1` = 仍有 TF/IA/IMT/SABA/Stake 等缺凭证
- Stake：`platforms.json` 使用字段 `accessToken`；`Client_GetCollectPlatform` 已映射为返回的 `Token`（`server/backend/core/esport-api/router.js`）

### IM / XBet / Stake 实时赔率前置条件

除 GraphQL（Stake）外，这三者赔率推送依赖：

1. 用户已登录新控制台（`localStorage.token` 供 A8 Socket）
2. Chrome 扩展已加载，并向 A8 聚合服务推送 `{ bets: [...] }`
3. 采集配置里对应平台已开启

无插件时 IM/XBet/Stake 的 oddsStore 可能长期为空，但 saveMatch 仍可能来自 GraphQL（Stake）或空轮询。

### SABA 备注

- 电竞页 HTML 缓存在浏览器 `sessionStorage` 键 `SABA:CONTENT`
- 解析失败时会清缓存并重拉页面

---

# A8 电竞聚合平台阶段性分析

以下章节整理自 A8 前端脚本与 arch-scan 的**参考笔记**（描述的是 A8 第三方平台行为，非本仓库运行时行为）。

## 1. 当前资料

- `index.js`：A8 前端编译后的 Vue 代码，包含平台适配、实时赔率缓存、下单校验、WebSocket 连接等逻辑。
- `index.css`：前端样式文件。
- `plug/`：目标站使用的 Chrome 插件（现位于 `client/chrome-extension/`；`client/web/extension/` 为旧副本可参考）。
- `browser_arch_scan_30min.js`：本地页面架构扫描脚本。
- `arch_scan_extension/`：本地 Chrome 扫描插件，用于长期采集页面请求、WebSocket、storage、资源信息。
- `arch-scan-report-2026-05-23T19-14-34-844Z.json`：已导出的扫描结果。

## 2. 整体架构判断

该网站不是单纯前端页面，也不是只调用一个后台接口。它更像是：

```text
第三方投注平台 / 数据源
        ↓
A8 自建实时聚合层
        ↓
A8 前端 Vue 应用
        ↓
页面展示 / 自动判断 / 下单流程
```

目前可以把服务分为两层：

```text
api.a8.to
  负责页面资源、登录态、配置、比赛列表、订单、余额、后台业务 API

47.115.75.57
  负责实时赔率聚合、WebSocket 推送、部分平台数据中转、Socket.IO 房间分发
```

`47.115.75.57` 是核心实时聚合服务器，但不是所有赔率的原始来源。部分平台仍会直接访问第三方 API 做快照、详情、余额或订单查询。

## 3. 前端关键状态：fo

`index.js` 里发现一个核心 Pinia store：`fo`。

它是前端实时赔率缓存，结构近似为：

```text
platform -> oddsId -> {
  id,
  betId,
  odds,
  isLock,
  time
}
```

重要行为：

- `fo.save(platform, Jn)`：写入或覆盖某个平台的某个赔率。
- `fo.getOdds(platform, oddsId)`：页面读取当前赔率。
- `fo.isOdds(platform, oddsId)`：判断某个赔率是否已经存在。
- `fo.updateOddsLock(...)` / `fo.updateBetLock(...)`：更新锁盘状态。

多数平台的实时 WebSocket 更新都不是直接改页面 DOM，而是先写入 `fo`，页面再从 `fo` 读取并刷新显示。

## 4. 插件功能概览

`plug` 是一个 Chrome MV3 插件，主要作用不是展示 UI，而是辅助网页获取平台登录态、token、referer、gateway 等信息，并作为请求中转层。

插件主要文件：

- `manifest.json`
- `background.js`
- `content.js`

主要能力：

- 从不同平台页面提取登录信息、token、gateway、referer、用户信息等。
- 通过 `chrome.runtime.onMessageExternal` 接收网页消息。
- 支持外部网页向插件发送 `GET` / `POST` 请求，由插件代发请求。
- 支持 `getStore` / `setStore` 保存和读取插件 storage。
- 某些平台会通过插件在目标页面环境内执行请求。

需要注意：插件 `externally_connectable` 范围较宽，允许 HTTP/HTTPS 页面与插件通信。这说明 A8 前端可以把平台请求交给插件执行，以绕过普通网页跨域或上下文限制。

## 5. 扫描报告结论

导出文件：

```text
arch-scan-report-2026-05-23T19-14-34-844Z.json
```

实际采集时间约 6 分 38 秒。共记录 612 条：

| 类型 | 数量 |
| --- | ---: |
| WebSocket 入站消息 | 398 |
| XHR 请求 | 163 |
| WebSocket 出站消息 | 42 |
| WebSocket 创建 | 3 |
| WebSocket 打开成功 | 2 |

出现最多的域名：

| 域名 | 次数 | 判断 |
| --- | ---: | --- |
| `47.115.75.57` | 431 | 实时聚合与 WebSocket |
| `api.a8.to` | 70 | A8 主业务后台 |
| `api-v4.tf-api-rr3h.com` | 22 | TF 平台 API |
| `cfinfo.365raylinks.com` | 14 | RAY 平台快照 API |
| `4hangzhou.goeasy.io` | 14 | 可能为通知/消息通道 |

## 6. 主要 WebSocket 连接

扫描报告中确认的实时连接：

```text
wss://47.115.75.57/socket.io/
wss://47.115.75.57/esport/ws/IA/
wss://47.115.75.57/esport/ws/OB
wss://47.115.75.57/esport/ws/RAY
wss://47.115.75.57/esport/ws/TF?auth_token=...&combo=false
wss://4hangzhou.goeasy.io/socket.io/
```

主要 Socket.IO 频道：

| 频道 | 数量 | 含义 |
| --- | ---: | --- |
| `XBet` | 268 | XBet 赔率推送 |
| `Stake` | 30 | Stake 比赛/盘口推送 |
| `XBet:Score` | 9 | XBet 比分推送 |
| `roomMessageCallBack` | 19 | 房间消息回调 |
| `joinRoomCallBack` | 1 | 加入房间回执 |

XBet 赔率消息结构示例：

```json
{
  "matchId": 723570330,
  "bets": [
    {
      "betId": 723570330,
      "name": "[全场]胜利",
      "home": 1.355,
      "away": 3.008
    }
  ]
}
```

XBet 比分消息结构示例：

```json
{
  "SourceID": "723570330",
  "Score": {
    "0": { "Home": 2, "Away": 2 },
    "1": { "Home": 10, "Away": 13 }
  }
}
```

## 7. A8 后台接口

扫描报告中出现较多的 A8 接口：

| 接口 | 次数 | 判断 |
| --- | ---: | --- |
| `Client_GetCollectPlatform` | 25 | 获取收藏/聚合平台 |
| `Client_GetGames` | 20 | 获取游戏/分类 |
| `Client_UpdateBalance` | 7 | 更新余额 |
| `Client_SaveOrder` | 5 | 保存订单/下单结果 |
| `Client_GetData` | 3 | 获取配置数据 |
| `Client_GetMatchs?user=TJ01` | 2 | 获取比赛列表 |
| `Client_GetMatchDefaultOdds` | 1 | 获取默认赔率 |
| `Client_GetTagPlatforms` | 1 | 获取平台标签 |

这些接口使用 A8 自己的 `token` 请求头。

## 8. RAY 平台分析

RAY 不是完全来自单个接口。它至少有两类来源：

### 8.1 HTTP 快照

```text
https://cfinfo.365raylinks.com/v2/match?match_type=2&page=1
https://cfinfo.365raylinks.com/v2/odds?match_id=...
```

作用：

- `/v2/match` 获取 RAY 比赛列表、队伍、游戏、开始时间。
- `/v2/odds` 获取某场比赛完整盘口快照。

代码逻辑：

```text
/v2/match
  ↓
转换成 A8 自己的比赛结构
  ↓
saveMatch(RAY, matches)

/v2/odds
  ↓
转换成 A8 自己的盘口结构
  ↓
saveBets(RAY, matchId, bets)
  ↓
同时写入 fo 实时赔率缓存
```

### 8.2 WebSocket 实时更新

```text
wss://47.115.75.57/esport/ws/RAY
```

RAY WebSocket 逻辑：

```js
if (fo.isOdds(RAY, oddsId)) {
  fo.save(RAY, new Jn(oddsId, odds, isLock))
}
```

这说明 RAY WebSocket 不会凭空创建一个未知盘口，只会更新已经通过 `/v2/odds` 建立过的盘口。

### 8.3 RAY 冲突处理

RAY 的处理方式可以理解为：

```text
HTTP 快照 = 建底表 / 初始化 / 定期校准
WebSocket = 实时增量更新 / 覆盖最新赔率
```

如果两个来源数据不同，前端基本以最后写入 `fo` 的数据为准。

示例：

```text
/v2/odds 写入 odds = 2.10
WS 推送 odds = 2.05
页面显示 2.05

WS 推送 odds = 2.05
30 秒后 /v2/odds 再写入 odds = 2.08
页面可能显示 2.08
```

下单前，RAY 还会再次请求：

```text
/v2/odds?match_id=...
```

然后按 `itemId` 找当前盘口，检查：

- `status`
- `enable_parlay`
- `bet_limit`
- 当前赔率

因此页面显示可能来自 WebSocket，但下单前会再通过 RAY HTTP 快照做最终确认。

## 9. TF 平台分析

TF 的结构与 RAY 类似，但 TF 更明显是：

```text
HTTP events 快照建盘口
WebSocket 实时覆盖赔率
single-bet 接口做下单前确认
```

### 9.1 HTTP 快照

TF 快照接口：

```text
https://api-v4.tf-api-rr3h.com/api/v8/events/
```

扫描报告中出现的形式：

```text
/api/v8/events/?game_id=&combo=false&outright=false&timing=today&market_option=MATCH
/api/v8/events/?event_id=...&market_option=MATCH
/api/v8/events/?event_id=...&map_option=MAP 1&market_option=MAP
/api/v8/events/?event_id=...&map_option=MAP 2&market_option=MAP
```

流程：

```text
拉今天的 TF 比赛列表
  ↓
过滤指定游戏和 1 小时内比赛
  ↓
按 event_id 拉全场盘口
  ↓
如果存在 market_tabs，继续拉 MAP 1 / MAP 2 / MAP 3 等地图盘口
  ↓
写入 fo
```

### 9.2 TF WebSocket

TF 实时连接：

```text
wss://47.115.75.57/esport/ws/TF?auth_token=...&combo=false
```

代码中 TF WebSocket 地址理论上会在以下两个 host 间切换：

```text
api.a8.to
47.115.75.57
```

但本次扫描实际捕获到的是：

```text
47.115.75.57
```

### 9.3 TF 赔率 ID 规则

TF 的赔率 key 不是单纯 odds id，而是：

```text
market_id:selection.name
```

HTTP 快照写入：

```js
fo.save(TF, new Jn(`${market_id}:${selection.name}`, selection.euro_odds, selection.status !== "open", market_id))
```

WebSocket 更新：

```js
if (!fo.isOdds(TF, `${market_id}:${selection.name}`)) return
fo.save(TF, new Jn(`${market_id}:${selection.name}`, selection.euro_odds, selection.status !== "open", market_id))
```

因此 TF WebSocket 也不会创建未知盘口，只更新已存在的盘口。

### 9.4 TF 冲突处理

TF 与 RAY 一样，基本是最后写入 `fo` 的数据生效。

```text
HTTP events 快照写入 odds = 1.90
WS 推送 odds = 1.87
页面显示 1.87

30 秒后 HTTP events 再刷新 odds = 1.89
页面可能显示 1.89

随后 WS 再推送 odds = 1.86
页面再显示 1.86
```

### 9.5 TF 下单前确认

TF 下单前不是再拉 `/events`，而是请求：

```text
/api/game-client/v8/single-bet/
```

逻辑：

- 先构造一个单注请求检查盘口。
- 如果返回新赔率，会更新订单赔率。
- 如果返回错误，则标记不可下单或锁盘。
- 正式下注也走同一个 `single-bet` 接口。

TF 订单查询：

```text
/api/v8/transactions/?transaction_type=current
/api/v8/transactions/?transaction_type=history
```

## 10. 已识别平台来源概览

| 平台/来源 | 数据路径 | 当前判断 |
| --- | --- | --- |
| XBet | `wss://47.115.75.57/socket.io/` channel `XBet` | 赔率由 A8 实时聚合服务推送 |
| XBet Score | `wss://47.115.75.57/socket.io/` channel `XBet:Score` | 比分推送 |
| Stake | `wss://47.115.75.57/socket.io/` channel `Stake` | Stake 数据经聚合服务推给 A8 页面 |
| RAY | `cfinfo.365raylinks.com` + `47.115.75.57/esport/ws/RAY` | HTTP 建快照，WS 更新 |
| TF | `api-v4.tf-api-*.com` + `47.115.75.57/esport/ws/TF` | HTTP 建快照，WS 更新 |
| IA | `47.115.75.57/esport/ws/IA/` | 房间消息推送，另有平台 API |
| OB | `47.115.75.57/esport/ws/OB` | WebSocket 实时推送 |

## 11. 复制功能的关键难点

只复制前端页面不够。真正难点在于重建以下能力：

1. 平台账号和 token 的采集、保存、刷新。
2. 第三方平台请求代理。
3. 多平台比赛匹配与标准化。
4. 多平台盘口标准化。
5. 实时赔率 WebSocket 聚合。
6. 快照与实时推送的冲突处理。
7. 下单前二次校验。
8. 订单保存、余额更新、结算同步。

## 12. 后续建议

下一步建议继续采集：

- 运行扫描插件满 30 分钟。
- 同时打开 A8 主站和第三方平台页面。
- 执行完整流程：打开比赛、切换平台、查看盘口、刷新余额、触发下单前校验。
- 分平台继续分析：IA、OB、XBet、Stake、SABA、IM、PB、IMT、HG/HGA。
- 对每个平台整理：
  - 比赛列表来源
  - 盘口快照来源
  - 实时赔率来源
  - oddsId / betId 规则
  - 下单前校验接口
  - 正式下单接口
  - 订单查询接口
  - 余额接口

## 13. 当前阶段结论

目前可以确定：

```text
A8 前端通过 HTTP 快照建立比赛和盘口基础数据。
实时赔率主要通过 47.115.75.57 的 WebSocket 聚合服务推送。
前端统一把赔率写入 fo 缓存。
页面展示以 fo 中最后写入的数据为准。
下单前会再调用对应平台接口做最终确认。
```

RAY 和 TF 均符合：

```text
快照接口建底表
WebSocket 更新已有盘口
下单前平台接口二次确认
```

## 14. 全平台数据路径和网页实时更新逻辑

本节按 `index.js` 中的 provider 枚举整理：

```text
OB / IM / RAY / TF / IA / SABA / XBet / PB / IMT / HG / Stake
```

整体规律：

```text
比赛/盘口快照
  ↓
saveMatch / saveBets 同步到 A8 聚合后台
  ↓
fo.save 写入前端实时赔率缓存
  ↓
WebSocket / 轮询 / 插件消息继续覆盖 fo
  ↓
页面从 fo.getOdds 读取当前展示赔率
```

`fo` 是页面赔率显示的核心缓存。大部分平台最终都会把赔率转为：

```text
provider + itemId -> Jn(id, odds, isLock, betId)
```

如果快照和实时推送数据不同，页面通常以最后写入 `fo` 的数据为准。下单前再由各平台适配器调用对应校验接口，确认盘口、赔率、限额和锁盘状态。

### 14.1 公共实时总线

A8 页面会连接：

```text
https://47.115.75.57
```

通过 Socket.IO 加入这些房间：

```text
IM
Stake
XBet
XBet:Score
```

收到 `chat message` 后按 `channel` 分发给 `ph[channel]`：

```text
47.115.75.57/socket.io
  ↓
chat message { channel, message }
  ↓
ph[channel](message)
  ↓
fo.save / updateScore
```

这条公共总线主要承接 IM、Stake、XBet、XBet 比分等聚合后的实时数据。

### 14.2 OB

OB 是“平台 HTTP 快照 + MQTT over WebSocket 实时更新”。

快照路径：

```text
{gateway}/game/index?game_id=0&flag=1&day=1
{gateway}/game/view?match_id={matchId}&stage_id={stageId}
{gateway}/game/getTimer
```

快照逻辑：

- 每 30 秒读取 OB 比赛列表。
- 过滤配置中的游戏和 1 小时内比赛。
- 对每场比赛按 `stage_id` 拉盘口。
- 将比赛写入 `saveMatch(OB, matches)`。
- 将盘口写入 `saveBets(OB, matchId, bets)`。
- 同时把每个 odds 写入 `fo.save(OB, new Jn(...))`。

实时连接：

```text
wss://47.115.75.57/esport/ws/OB
```

协议是 MQTT over WebSocket。主要 topic：

```text
/market/oddsUpdate/
/market/statusUpdate/
/market/suspended/
```

实时更新逻辑：

```text
/market/oddsUpdate/
  如果 fo 中已有 odds id
  ↓
  更新 odd

/market/statusUpdate/
/market/suspended/
  ↓
  updateBetLock 更新锁盘状态
```

OB 的实时推送不会创建未知盘口，只更新已经由 HTTP 快照建立过的盘口。

### 14.3 IM

IM 的实时赔率来自 A8 公共 Socket.IO 聚合通道。

实时路径：

```text
wss://47.115.75.57/socket.io/
channel = IM
```

实时消息结构按代码判断类似：

```text
message.bets[]:
  betId
  home
  away
```

写入规则：

```text
home itemId = {betId}:1
away itemId = {betId}:2
```

然后写入：

```text
fo.save(IM, new Jn("{betId}:1", home, false, betId))
fo.save(IM, new Jn("{betId}:2", away, false, betId))
```

IM 下单前校验接口：

```text
{gateway}/api/GetBetInfoSingleV2
```

正式下单：

```text
{gateway}/api/PlaceBetV2
```

余额：

```text
{gateway}/api/GetMemberBalance
```

订单：

```text
{gateway}/api/GetBetStatement
```

当前代码里 IM 的本地比赛快照采集不如 RAY/TF/OB 明显，前端主要依赖 A8 已有比赛/盘口基础数据，再由公共实时通道覆盖赔率。

### 14.4 RAY

RAY 是“HTTP 快照 + 专用 WebSocket 实时更新”。

快照路径：

```text
https://cfinfo.365raylinks.com/v2/match?match_type=2&page=1
https://cfinfo.365raylinks.com/v2/odds?match_id={matchId}
```

实时路径：

```text
wss://47.115.75.57/esport/ws/RAY
```

逻辑：

```text
/v2/match
  ↓
建立比赛基础信息
  ↓
saveMatch(RAY, matches)

/v2/odds
  ↓
建立盘口基础信息
  ↓
saveBets(RAY, matchId, bets)
  ↓
fo.save(RAY, oddsId)

RAY WebSocket
  ↓
如果 fo.isOdds(RAY, oddsId)
  ↓
fo.save(RAY, oddsId, latestOdds)
```

RAY 下单前再次请求：

```text
/v2/odds?match_id={matchId}
```

用来检查 `status`、`enable_parlay`、`bet_limit` 和最新赔率。

### 14.5 TF

TF 是“events 快照 + 专用 WebSocket 实时更新”。

快照路径：

```text
{gateway}/api/v8/events/?game_id=&combo=false&outright=false&timing=today&market_option=MATCH
{gateway}/api/v8/events/?event_id={eventId}&map_option=&market_option=MATCH
{gateway}/api/v8/events/?event_id={eventId}&map_option=MAP 1&market_option=MAP
{gateway}/api/v8/events/?event_id={eventId}&map_option=MAP 2&market_option=MAP
```

实时路径：

```text
wss://47.115.75.57/esport/ws/TF?auth_token=...&combo=false
```

代码里 TF WebSocket host 理论上会在以下两个之间轮换：

```text
api.a8.to
47.115.75.57
```

本次扫描实际捕获到的是 `47.115.75.57`。

TF 赔率 key：

```text
{market_id}:{selection.name}
```

快照和 WS 都使用同一个 key 写入 `fo`：

```text
fo.save(TF, new Jn("{market_id}:{selection.name}", euro_odds, isLock, market_id))
```

TF 下单前校验和正式下注都走：

```text
{gateway}/api/game-client/v8/single-bet/
```

订单：

```text
{gateway}/api/v8/transactions/?transaction_type=current
{gateway}/api/v8/transactions/?transaction_type=history
```

### 14.6 IA

IA 是“插件代理 HTTP 快照 + Socket.IO 房间实时更新”。

快照路径：

```text
https://ilustre-analytics.org/api/game/game/gameListPageSplit/
https://ilustre-analytics.org/api/game/game/getPointsListSplit
```

这些请求通过插件 `Yn.get` / `Yn.post` 执行。

实时路径：

```text
wss://47.115.75.57/esport/ws/IA/
path = /esport/ws/IA
RoomJoin: room_type_index_content_push
```

实时消息：

```text
message_type_bet_item_single_lock
  ↓
updateBetLock(IA, play_id, status)

message_type_push_point_change
  ↓
如果 fo.isOdds(IA, point_id)
  ↓
fo.save(IA, point_id, point)
```

快照写入：

```text
point_id -> fo.save(IA, new Jn(point_id, point, status !== 1, play_id))
```

IA 也是先由 HTTP 建盘口，再由 WS 更新已有点位。

### 14.7 SABA

SABA 是“页面内容解析配置 + SABA 自身 Socket.IO 实时流”。

初始配置路径：

```text
{gateway}/{token}/ESports/43/ALL?mode=m0&market=L
```

页面会从返回内容中解析：

```text
url
id
logo
account.pnv.tk
```

然后连接：

```text
wss://{解析出的 url}
```

连接参数：

```text
gid
token
id
rid
ext
```

订阅条件包括：

```text
sporttype = 43
marketid = L
bettype = [20, 9001]
```

实时消息处理：

```text
reset
  清空本地临时缓存

done
  将已收到的 match / odds 整理为比赛和盘口
  saveMatch(SABA, matches)
  saveBets(SABA, matchId, bets)

o
  单条 odds 更新
  fo.save(SABA, "{oddsid}:Home")
  fo.save(SABA, "{oddsid}:Away")

-o
  updateBetLock(SABA, oddsid, true)
```

SABA 赔率 key：

```text
{oddsid}:Home
{oddsid}:Away
```

余额：

```text
{gateway}/{token}/Customer/Balance
```

设置赔率格式：

```text
{gateway}/{token}/Customer/OddsType?set=1
```

保活：

```text
{gateway}/{token}/LoginCheckin/Index
```

下单前校验：

```text
{gateway}/{token}/Betting/GetTickets
```

正式下单：

```text
{gateway}/{token}/Betting/ProcessBet
```

订单：

```text
{gateway}/{token}/Statement/GetBetListApi?GMT=8
{gateway}/{token}/NonSportsStatementApi/GetSettledBetsLv2
```

### 14.8 XBet

XBet 的实时赔率和比分来自 A8 公共 Socket.IO 聚合通道。

实时路径：

```text
wss://47.115.75.57/socket.io/
channel = XBet
channel = XBet:Score
```

赔率消息：

```text
message.bets[]:
  betId
  home
  away
```

写入规则：

```text
home itemId = {betId}:1
away itemId = {betId}:3
```

```text
fo.save(XBet, new Jn("{betId}:1", home))
fo.save(XBet, new Jn("{betId}:3", away))
```

比分消息：

```text
XBet:Score
  ↓
updateScore(XBet, scorePayload)
```

XBet 的原始平台接口没有在当前扫描中完整展开，A8 页面看到的是已经由 `47.115.75.57` 整理后的聚合数据。

### 14.9 PB

PB 目前未看到专用 WebSocket，代码表现为高频 HTTP 轮询。

快照路径：

```text
{gateway}/sports-service/sv/euro/odds?sportId=12&isLive=true&...
```

执行方式：

```text
Yn.get(...)
```

说明 PB 请求依赖插件代理/页面上下文。

轮询逻辑：

```text
每 5 秒请求一次 odds
每 60 秒同步一次 saveMatch / saveBets
每次都把赔率写入 fo
```

PB 赔率 key：

```text
HOME: {eventId}|{period}|1|0|0|0|0
AWAY: {eventId}|{period}|1|1|0|0|1
```

下单前校验：

```text
{gateway}/member-betslip/v2/all-odds-selections
```

正式下单：

```text
{gateway}/bet-placement/buyV4
```

余额：

```text
{gateway}/member-service/v2/account-balance
```

订单：

```text
{gateway}/member-service/v2/wager-filter
{gateway}/member-service/v2/my-bets
```

PB 属于“HTTP 快照轮询即实时”的模式，不依赖 `47.115.75.57` 推送。

### 14.10 IMT

IMT 也未看到专用 WebSocket，代码表现为全量 + delta 轮询。

全量快照：

```text
{gateway}/mobilesitev2/api/Event/GetAllLiveEvents
```

增量更新：

```text
{gateway}/mobilesitev2/api/Event/getAllLiveEventsDelta
```

请求头包含平台会话信息：

```text
x-token
x-v
x-sc
referer
user-agent
```

轮询逻辑：

```text
每 60 秒拉一次全量 GetAllLiveEvents
保存 saveMatch / saveBets
记录 Delta

每 1 秒拉 getAllLiveEventsDelta
根据 Delta 返回更新 odds
fo.save(IMT, "{selectionId}:{wagerSelectionId}")
```

IMT 赔率 key：

```text
{si}:{wsi}
```

下单前校验：

```text
{gateway}/mobilesitev2/api/PlaceBet/GetBetInfo
```

余额：

```text
{gateway}/mobilesitev2/api/Member/GetMemberBalance
```

订单：

```text
{gateway}/mobilesitev2/api/MyBet/GetBetStatement
```

IMT 属于“全量快照 + 高频 delta 轮询”的实时模式。

### 14.11 HG

HG/HGA 与其他平台不同，当前没有看到标准赔率实时流。它更像是订单/跟单/账户接口适配。

主要路径：

```text
{gateway}/transform.php?ver={ver}
```

常见参数：

```text
p=get_member_data
p={gtype}_order_view
p={gtype}_bet
p=get_today_wagers
p=history_switch
p=memSet
```

A8 还会通过：

```text
https://api.a8.to/common/API_GetData?key=HG:{username}
```

读取插件或后台保存的 HG 订单数据。

插件侧也存在 HG/HGA 监听逻辑，会轮询 `transform.php` 获取 wager/order，再上报到 A8 的 Common API。当前没有证据表明 HG 的网页实时赔率显示依赖类似 RAY/TF 的 WS。

HG 下单前校验：

```text
{gateway}/transform.php?ver={ver}
p={gtype}_order_view
```

正式下单：

```text
{gateway}/transform.php?ver={ver}
p={gtype}_bet
```

余额：

```text
{gateway}/transform.php?ver={ver}
p=get_member_data
```

订单：

```text
{gateway}/transform.php?ver={ver}
p=get_today_wagers
p=history_switch
```

### 14.12 Stake

Stake 强依赖 Chrome 插件，因为真实请求需要在已登录 Stake 标签页上下文里执行。

快照路径：

```text
/_api/graphql
```

GraphQL 查询：

```text
SportIndex($sport, $groups)
```

查询的 sport：

```text
dota-2
counter-strike
league-of-legends
kings-of-glory
valorant
```

查询的盘口组：

```text
winner
maps
```

A8 页面流程：

```text
从插件 storage 获取 Stake tabId
  ↓
通过 Yn.post("/_api/graphql", ..., { tabId })
  ↓
在 Stake 标签页上下文请求 GraphQL
  ↓
转换为 A8 match/bet
  ↓
saveMatch(Stake)
  ↓
saveBets(Stake)
```

同时页面会把需要订阅的 fixture 列表发给插件：

```text
Yn.sendMessage({
  type: "",
  data: subscribeList,
  options: { tabId }
})
```

插件侧在 `stake.com` 页面里连接 Stake 自身 GraphQL WebSocket，然后把整理后的消息发送到 A8 聚合服务，A8 页面再从公共通道接收：

```text
Stake 页面 GraphQL WebSocket
  ↓
Chrome 插件 content script
  ↓
47.115.75.57 socket.io channel = Stake
  ↓
A8 页面 ph[Stake]
  ↓
fo.save(Stake, homeId/awayId)
```

Stake 实时写入：

```text
homeId -> fo.save(Stake, home odds)
awayId -> fo.save(Stake, away odds)
```

下单前校验：

```text
/_api/graphql
query SportBet_SportMarketOutcome
```

正式下单：

```text
/_api/graphql
mutation BetSlipFooter_SportBet
```

订单：

```text
/_api/graphql
activeSportBets
sportBetList
```

Stake 是“插件执行平台请求 + 插件监听平台 WS + A8 聚合服务转发”的模式。

## 15. 平台实时模式分类

| 类型 | 平台 | 特征 |
| --- | --- | --- |
| HTTP 快照 + 专用 WS | OB、RAY、TF、IA、SABA | 先建盘口，再实时覆盖 |
| A8 公共聚合 WS | IM、XBet、Stake | `47.115.75.57/socket.io` 分频道推送 |
| 高频 HTTP 轮询 | PB、IMT | 没看到专用 WS，依靠快照/delta 轮询 |
| 订单/跟单适配为主 | HG/HGA | 主要通过 `transform.php` 和 A8 Common API |

## 16. 网页实时刷新机制

页面不是靠定时刷新 DOM，而是靠状态驱动：

```text
接口/WS/插件消息
  ↓
统一转换为 Jn
  ↓
fo.save(provider, Jn)
  ↓
Vue/Pinia 响应式状态变化
  ↓
页面赔率组件重新读取 fo.getOdds
  ↓
赔率显示更新
```

锁盘和封盘：

```text
updateOddsLock(provider, itemId, true/false)
updateBetLock(provider, betId, true/false)
```

比分：

```text
updateScore(provider, scorePayload)
```

冲突处理：

```text
同一个 provider + itemId 多次写入
  ↓
Map 中旧值被覆盖
  ↓
最后写入的数据成为当前页面显示值
```

下单前最终确认：

```text
页面显示赔率
  ↓
构造 Tp 订单对象
  ↓
account.checkBet(...)
  ↓
平台接口返回最新赔率/限额/状态
  ↓
必要时 updateOdds 或锁盘
  ↓
account.betting(...)
```

因此，页面显示赔率并不等于最终可下单赔率；最终以对应平台的下单前校验接口为准。
