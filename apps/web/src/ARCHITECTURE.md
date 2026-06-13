# apps/web 架构说明

本文档描述 `src/` 目录的职责划分与数据流，便于新增平台或排查问题。

**外行快速导航（按角色 5 分钟读文件）**：[`docs/QUICK_START_FILES.md`](../docs/QUICK_START_FILES.md)

## 四条主线

```
┌──────────────────────────────────────────────────────────────────────┐
│ ① 本系统 API     api/ + types/       →  apps/backend /esport、/v4.0 │
│ ② 比赛列表       matcher → client_matches（浏览器 saveMatch 上报）   │
│ ③ 赔率上报       packages/platform-adapter/{平台}/frontend/collect.ts → SaveBet（+ fo）        │
│ ④ 平台下注       packages/platform-adapter/{平台}/frontend/bet.ts  →  场馆 gateway + 账号 token │
│ ⑤ UI 编排        stores/ + views/ + components/                      │
└──────────────────────────────────────────────────────────────────────┘
```

| 目录 | 职责 | 典型入口 |
|------|------|----------|
| `api/` | 封装 `Client_*` 等后端接口 | `api/esport.ts`（barrel）→ `client` / `auth` / `match` / … |
| `api/v4.ts` | A8 v4 信用盘试玩（平博/OB/SABA） | `enterCreditPlate` — 详见 [docs/CREDIT_PLATE.md](../docs/CREDIT_PLATE.md) |
| `types/` | DTO、用户配置、纯类型 | `types/collect.ts`, `types/esport.ts` |
| `models/` | 带方法的领域类 | `PlatformAccount`, `BetOption` |
| `domain/` | **套利/下注纯逻辑**（无 Pinia、可单测） | `domain/arbitrage`, `domain/betting` |
| `packages/platform-adapter/` | **平台清单、能力与平台实现**（Vite `@platform`） | `registry/adapters.ts`, `ob/frontend/collect.ts`, `ob/frontend/bet.ts` |
| `shared/` | **横切工具**（与采集/下注无关） | `format`, `platformHttp` |
| `runtime/` | **运行时入口注册** | `runtime/collectors.ts`, `runtime/providers.ts` |
| `packages/platform-adapter/{id}/frontend/collect.ts` | **赔率上报链路** | `start*Collector` |
| `packages/platform-adapter/shared/` | **仅采集专用** | `collectSession`, `collectNotify`, `socket/` |
| `packages/platform-adapter/{id}/frontend/bet.ts` | **下注** | `obProvider` 等 |
| `stores/` | Pinia 状态与编排 | `matchStore`, `accountStore`, `bettingStore` |
| `packages/platform-adapter/hg/frontend/follow.ts` | HG 跟单循环 | `startHgFollowLoop` |

**原则**：`bet.ts` 不依赖 `collect.ts`；二者都可用 `shared/`，但 `bet.ts` 不应依赖 `platforms/shared/`（采集专用）。

### 平台能力矩阵（`packages/platform-adapter/registry/adapters.ts`）

| 平台 | 采集 | 下注 | 备注 |
|------|------|------|------|
| OB / IM / RAY / TF / IA / SABA / PB / IMT / HG | ✓ | ✓ | |
| XBet | ✓ | — | A8 Socket 频道，无 provider |
| Stake | ✓ | ✓* | *`pluginOnly`：需 Chrome 扩展 + stake.com tab；`stakeProvider` 已实现 GraphQL 下单 |

`ALL_PLATFORMS`、`PLATFORMS` 均从 `@platform/registry` 导出；新增平台时改 `packages/platform-adapter/registry/`，并在 `runtime/collectors.ts` / `providers.ts` 经 registry 自动注册。

账号鉴权（与采集解耦）：`packages/platform-adapter/pb/frontend/auth.ts`、`packages/platform-adapter/tf/frontend/auth.ts` ← `platformHttp` 与采集侧共同使用。

---

## 数据流

### 比赛列表（后端入库，Changmen 主路径）

```
浏览器 saveMatch / saveBet（`packages/platform-adapter` / `@platform` 采集）
         ──► API_SaveMatch / API_SaveBet
         ──► matcher → client_matches
         ──► Client_GetMatchs
         ──► matchStore（前端只读列表）
```

入库时间窗校验在 `store.saveMatches`（过期赛程不写入）。

### 赔率上报（前端）

```
场馆 API / WS / MQTT ──► platforms/{平台}/collect.ts
         ──► 解析为 CollectBetDto（+ 本地 oddsStore）
         ──► collectStore.saveBets（开关控制）
         ──► api/esport API_SaveBet
         ──► backend bets.json
         ──► Client_GetMatchs 合并 → UI
```

上报开关：`collectStore`（由 `runtime/collectors.ts` 启动）。语义是”是否调用 `saveBets` 写入后端”，不是”是否连接平台拉赔率”。  
历史代码里仍有 `saveMatch` 调用；**比赛列表以服务端 `matches.json` 为准**。

### 下注（出单）

```
UI 点击 ──► accountStore.checkBetting / betting
        ──► platforms/{平台}/bet.ts (checkBet / betting / getBalance)
        ──► shared/platformHttp (账号 gateway + token + 代理)
        ──► 场馆 API
```

账号模型：`models/platformAccount.ts`；列表与选中：`accountStore`。

### 自动套利（编排）

```
bettingStore.runTick
  ──► matchStore.fetchMatches + updateOdds
  ──► notifyArb（Telegram 机会扫描）
  ──► autoBetLoop.runAutoBetTick
        └── executeArbBet（单场单 bet）
              ├── domain/betting.buildOrderOptions（经 ViewBet.getOrderOptions）
              ├── accountStore.getAccount / checkBetting / betting
              ├── autoBet/retryFailedLeg（一侧失败换平台）
              ├── autoBet/rejectWait（拒单等待 + updateVenueOrders）
              ├── autoBet/makeUp（补单门控 + loseOrder 入队）
              └── successMarkers.markSuccessfulBet + betTiming 计数
  ──► processLoseOrders（补单队列）
```

手动双击：`bettingStore.manualBet` → `manualBet.ts`（同样走 `accountStore` + `successMarkers`）。

### 用户信息与延迟显示（`Client_GetUserInfo`）

- 对齐 A8：延迟值来自统一请求封装 `api/client.ts` 的 `post()` 耗时采样。
- 每次任意 API 请求完成后，`post()` 会更新 `userStore.apiDelay`（用于右上角 `xxms` 显示）。
- 不再使用定时 `Client_GetUserInfo` 心跳探针，因此不会出现该接口高频轮询。

---

## 目录约定

### `domain/`（套利与下注规则）

与 Pinia / Vue 解耦，优先放这里便于单测与 A8 对照。

| 路径 | 用途 | 对齐 A8 |
|------|------|---------|
| `domain/arbitrage/pickArbLegs.ts` | 跨平台选最优主客腿、隐含利润率 | bundle 套利检测 |
| `domain/arbitrage/valueBet.ts` | 相对初赔公允线的价值下注评估 | [changmen 扩展] |
| `domain/betting/buildOrderOptions.ts` | 对冲金额、`betSorting`、WinRate | `IQ.GetOrderOptions` / `oJe` |
| `domain/betting/providerKeys.ts` | `display` vs `auto` 平台范围 | UI 全平台 / 自动仅在线账号 |
| `domain/betting/venueReject.ts` | 场馆拒单判定 | bundle 拒单检测 |

`models/match.ts` 的 `ViewBet.getOrderOptions` 委托 `buildOrderOptions`，保持模型 API 不变。

### `stores/betting/`（下注编排）

| 路径 | 用途 |
|------|------|
| `bettingStore.ts` | 定时器、`runTick`、手动下注入口 |
| `autoBetLoop.ts` | 自动投注 tick：清队列、随机金额、遍历比赛 |
| `autoBet/executeArbBet.ts` | 单场套利全流程 |
| `autoBet/makeUp.ts` | 补单阈值 + 入队 |
| `autoBet/rejectWait.ts` | 成功后拒单等待 |
| `autoBet/retryFailedLeg.ts` | `anyOdds` 失败腿换平台重试 |
| `loseOrder.ts` | 补单队列处理 |
| `manualBet.ts` | 双击手动下单 |
| `betFilters.ts` | 账号过滤（初赔、lastOdds、maxBetCount） |
| `successMarkers.ts` | 成功标记、`BETACCOUNT` sessionStorage |
| `notifyArb.ts` | 套利 Telegram 扫描 [changmen 扩展] |

### `shared/`（横切）

| 文件 | 用途 |
|------|------|
| `format.ts` | 日期、赔率展示、套利百分比 |
| `wait.ts` | `sleep` |
| `md5.ts` / `totp.ts` | OB 签名、谷歌验证码 |
| `platform.ts` | `PLATFORMS` 常量、MQTT/WS relay URL |
| `a8Axios.ts` | 对齐 A8 `Nr`：Axios 实例（15s 超时，500/504 不 throw） |
| `http.ts` | 采集直连 `directGet` / `directPostJson`（**Axios**，非 fetch） |
| `platformHttp.ts` | **投注账号** HTTP（OB/RAY/TF…；Axios + 可选 relay） |
| `betTiming.ts` | 下注通知时长、`lastOdds`、`BETCOUNT` / `GAMEBETCOUNT` |
| `winRate.ts` | WinRate 排序（`betSorting: WinRate`） |
| `bracketForm.ts` | 嵌套 form-urlencoded（SABA 等） |

### `platforms/{平台}/`（扁平结构）

采集与下注文件与平台目录同级，无 `collector/` / `provider/` 子目录：

| 文件 | 用途 |
|------|------|
| `index.ts` | `PlatformAdapter`（`collector` + `provider` 的汇总入口） |
| `collect.ts` | `startXxxCollector()` — 采集主循环 |
| `bet.ts` | `xxxProvider` — 实现 `PlatformProvider`（checkBet / betting / getBalance） |
| `parse.ts` | 字段解析（采集 + 下注共用） |
| `markets.ts` | OB 专用：盘口灌 fo（`game/view`） |
| `mqtt.ts` | OB 专用：MQTT 订阅与增量处理 |
| `auth.ts` / `ws.ts` 等 | 协议细节（按需，如 PB/TF/IMT） |

`bet.ts` 使用 `@/shared/platformHttp`，**不**依赖 `collect.ts` 也不依赖 `platforms/shared/`。

### `platforms/shared/`

| 路径 | 用途 |
|------|------|
| `collectSession.ts` | 解析 PB/IMT 等采集用 gateway+token |
| `collectNotify.ts` | 采集错误 → Telegram |
| `socket/hub.ts` | A8 Socket.IO 连接（IM / XBet 共用） |
| `socket/collector.ts` | `startA8BetsCollector`：A8 Socket 频道薄采集入口 |
| `socket/accumulator.ts` | 赔率增量合并与 fo 写入（Socket 收到的 bets 消息） |

---

## types 与 models

| | `types/` | `models/` |
|---|----------|-----------|
| 内容 | API 入参/出参、配置 JSON | 类 + 业务方法 |
| 例子 | `CollectBetDto`, `UserConfig` | `BetOption`, `PlatformAccount` |

新增接口字段先改 `types/`，再在 store/model 里组装。

---

## 新增平台 Checklist

1. `types/esport.ts` — `PlatformId`（若尚未存在）
2. `platforms/registry.ts` — `PLATFORM_REGISTRY` 一条
3. `platforms/{平台}/collect.ts` — `startXxxCollector()`
4. `platforms/{平台}/bet.ts` — `xxxProvider`（实现 `PlatformProvider`）
5. `platforms/{平台}/index.ts` — 导出 `PlatformAdapter`
6. `runtime/collectors.ts` / `runtime/providers.ts` — 注册 adapter
7. `apps/backend` — `platform_sync.js` 加 `syncXxxFromEnv` 并在 `ensurePlatformCredentials` 中调用
8. UI — 采集开关、账号卡片（通常随 `ALL_PLATFORMS` 自动出现）

---

## 相关脚本

- 开发：`npm run dev`（Vite 5174，`/` base）
- 构建：`npm run build`
- 后端代理：见 `vite.config.ts` 中 `/esport` → `VITE_API_PROXY`

---

## api 分域（`api/*.ts`）

| 文件 | 职责 |
|------|------|
| `client.ts` | token、`post`、`unwrap` |
| `auth.ts` | 登录、用户信息 |
| `platform.ts` | 采集平台配置、`updatePlatform` |
| `match.ts` | `SaveMatch` / `SaveBet` / `getMatchs` |
| `kv.ts` | `Client_GetData` / `SaveData` / 用户 setting |
| `order.ts` | 订单列表与保存 |
| `account.ts` | 余额、账变、标签平台 |
| `report.ts` | 月报、利润、默认赔率 |
| `chat.ts` | 聊天、用户列表、日志 |
| `hg.ts` | 皇冠跟单队列（`/common`） |
| `v4.ts` | 信用盘试玩（`/v4.0`） |

### 信用盘 v4（平博入口）

主站登录与 v4 登录账号不同；本地 Vite（`:5174`）默认**浏览器直连** `https://api.a8.to/v4.0/`（对齐 A8 bundle）；仅 `VITE_V4_PROXY=1` 时走 `/v4.0/` 经 backend 代理。

**联调状态**：`user/account/login` 第一步已通过（2026-05-26）。完整流程、环境与验收见 [docs/CREDIT_PLATE.md](../docs/CREDIT_PLATE.md)。

业务代码可继续 `import { … } from "@/api/esport"`，或按域从 `@/api/match` 等直接引用。

## 已知待整理（非阻塞）

- `src/utils/a8MatchTime.ts` 被 `platforms/tf/collect.ts` 和 `platforms/shared/socket/accumulator.ts` 引用，暂保留；若后续移入 `shared/` 需同步更新两处 import
