# client/web 架构说明

本文档描述 `src/` 目录的职责划分与数据流，便于新增平台或排查问题。

**外行快速导航（按角色 5 分钟读文件）**：[`docs/QUICK_START_FILES.md`](../docs/QUICK_START_FILES.md)

## 四条主线

```
┌──────────────────────────────────────────────────────────────────────┐
│ ① 本系统 API     api/ + types/       →  server/backend /esport、/v4.0 │
│ ② 比赛列表       matcher → client_matches（浏览器 saveMatch 上报）   │
│ ③ 赔率上报       client/platform-adapter/{平台}/collect.ts → SaveBet（+ fo）        │
│ ④ 平台下注       client/platform-adapter/{平台}/bet.ts  →  场馆 gateway + 账号 token │
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
| `client/platform-adapter/` | **平台清单、能力与平台实现**（Vite `@platform`） | `registry/adapters.ts`, `ob/collect.ts`, `ob/bet.ts` |
| `shared/` | **横切工具**（与采集/下注无关） | `format`, `platformHttp` |
| `runtime/` | **运行时入口注册** | `runtime/collectors.ts`, `runtime/providers.ts`, `runtime/appSession.ts` |
| `client/platform-adapter/{id}/collect.ts` | **赔率上报链路** | `start*Collector` |
| `client/platform-adapter/shared/` | **仅采集专用** | `collectSession`, `collectNotify`, `socket/` |
| `client/platform-adapter/{id}/bet.ts` | **下注** | `obProvider` 等 |
| `stores/` | Pinia 状态与编排 | `matchStore`, `accountStore`, `bettingStore` |
| `client/platform-adapter/hg/follow.ts` | HG 跟单循环 | `startHgFollowLoop` |

**原则**：`bet.ts` 不依赖 `collect.ts`；二者都可用 `shared/`，但 `bet.ts` 不应依赖 `platforms/shared/`（采集专用）。

### 平台能力矩阵（`client/platform-adapter/registry/adapters.ts`）

| 平台 | 采集 | 下注 | 备注 |
|------|------|------|------|
| OB / IM / RAY / TF / IA / SABA / PB / IMT / HG | ✓ | ✓ | |
| XBet | ✓ | — | A8 Socket 频道，无 provider |
| Stake | ✓ | ✓* | *`pluginOnly`：需 Chrome 扩展 + stake.com tab；`stakeProvider` 已实现 GraphQL 下单 |

`ALL_PLATFORMS`、`PLATFORMS` 均从 `@platform/registry` 导出；新增平台时改 `client/platform-adapter/registry/`，并在 `runtime/collectors.ts` / `providers.ts` 经 registry 自动注册。

账号鉴权（与采集解耦）：`client/platform-adapter/pb/auth.ts`、`client/platform-adapter/tf/auth.ts` ← `platformHttp` 与采集侧共同使用。

---

## 数据流

### 比赛列表（后端入库，Changmen 主路径）

```
浏览器 saveMatch / saveBet（`client/platform-adapter` / `@platform` 采集）
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
matchStore.runMainLoopTick（A8 `P()`，轮间 100ms）
  ──► 30s 门控 fetchMatches + oddsStore.clean，否则 refreshOddsOnBets
  ──► runArbBetRound（config.betting 时按 arbDetectEngine 分发）
        ├── a8（默认）：a8/runA8ArbRound — 全表串行 executeArbBet
        └── kakaxi：kakaxi/runKakaxiArbRound — 消费队列（不全表遍历）
              ├── kakaxi/detectFeed（odds 事件 → funded pickArbLegs → 入队）
              └── kakaxi/scheduler → executeArbBet（与 a8 共用管线）
        └── executeArbBet（单场单 bet，a8 / kakaxi 共用）
              ├── domain/betting.buildOrderOptions（经 ViewBet.getOrderOptions）
              ├── accountStore.getAccount / checkBetting / betting
              ├── autoBet/retryFailedLeg（一侧失败换平台）
              ├── autoBet/rejectWait（拒单等待 + updateVenueOrders）
              ├── autoBet/makeUp（补单门控 + loseOrder 入队）
              └── successMarkers.markSuccessfulBet + betTiming 计数
  ──► processLoseOrders（补单队列，与执行模式无关）
  ──► 10min 门控 fetchMatchDefaultOdds
```

配置 `arbDetectEngine`：`a8`（默认，与 bundle 一致）| `kakaxi`（并列调度，扩展页「实验」解锁）。旧版 USERCONFIG 若仅有 `arbExecuteEngine`，加载时仍可读；保存只写 `arbDetectEngine`。

### 调度模式 vs `extensions/`（勿混淆）

| 层级 | 目录 | 职责 |
|------|------|------|
| **调度** | `stores/betting/a8/`、`stores/betting/kakaxi/` | 并列的两种套利**调度系统**：决定跑哪些 bet、以何种顺序/队列调用 `executeArbBet` |
| **执行** | `stores/betting/autoBet/` | A8 与 kakaxi **共用**的单场下注管线 |
| **扩展能力** | `extensions/arbOpportunity`、`arbMarketWatch`、`arbBet`、`notify` | 检测输入、盯盘、UI、Telegram；可接入 kakaxi，**不是**调度模式本身 |

- `runArbBetRound` 按 `arbDetectEngine`（`types/arbDetectEngine.ts`）在 **a8 | kakaxi** 间分发；默认 `a8` 与 bundle 一致。
- kakaxi 的 `detectFeed` 可消费 `extensions/arbOpportunity/detect`，属于调度层**使用**扩展能力，故 **kakaxi 留在 `stores/betting/kakaxi/`**，与 `a8/` 并列，不迁入 `extensions/`。

手动双击：`bettingStore.manualBet` → `manualBet.ts`（同样走 `accountStore` + `successMarkers`）。

登录后会话生命周期由 `runtime/appSession.ts` 统一编排（`HomeView` 调用 `startAppSession` / `mountAppSession` / `stopAppSession`）；采集/HG 细节仍在 `runtime/sessionBoot.ts`。

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
| `domain/betting/singleLegRate.ts` | 比例 9999 单边模式、linkId | [changmen 扩展] |
| `domain/betting/betFilters.ts` | 账号主过滤（初赔、lastOdds、maxBetCount） | A8 对齐 |
| `domain/betting/describeArbPrepareSkip.ts` | GetOrderOptions 跳过原因文案 | [changmen 扩展] |
| `extensions/arbBet/` | BetRow 红线/flash UI（规则见 `domain/betting/singleLegRate`） | [changmen 扩展] |
| `extensions/arbBet/ui/` | 赔率涨跌动画、套利腿连线与利润角标 | [changmen 扩展] |
| `domain/betting/buildOrderOptions.ts` | 对冲金额、`betSorting`、WinRate | `IQ.GetOrderOptions` / `oJe` |
| `domain/betting/providerKeys.ts` | `auto` = `getProviders()` | A8 下单平台范围 |
| `domain/betting/venueReject.ts` | 场馆拒单判定 | bundle 拒单检测 |

`models/match.ts` 的 `ViewBet.getOrderOptions` 委托 `buildOrderOptions`，保持模型 API 不变。

### `stores/account/`（账号与下注网关）

| 路径 | 用途 |
|------|------|
| `accountStore.ts` | Pinia 门面（对齐 A8 `Io`） |
| `account/accountCrud.ts` | 列表加载、保存、创建/删除、充提流水 |
| `account/accountPicker.ts` | `getProviders`、`getAccount` 轮询选号 |
| `account/betGateway.ts` | `checkBetting`、`betting` 通知与场馆下单 |
| `account/balanceRefresh.ts` | 余额刷新循环（120s + 随机 60s） |
| `account/venueOrders.ts` | 场馆订单同步、拒单检测用 |

### `stores/betting/`（下注编排）

| 路径 | 用途 |
|------|------|
| `bettingStore.ts` | 手动下注、补单入口；主循环在 matchStore |
| `runArbBetRound.ts` | 主循环单轮：按调度模式分发套利 + 补单 |
| `types/arbDetectEngine.ts` | 解析 `arbDetectEngine` → `a8` \| `kakaxi` |
| `a8/runA8ArbRound.ts` | [A8 可证实] **调度模式 a8**：全表串行 `executeArbBet` |
| `kakaxi/` | [changmen 扩展] **调度模式 kakaxi**（与 `a8/` 并列）：detectFeed → queue → scheduler |
| `autoBet/executeArbBet.ts` | 单场套利编排入口（两种调度共用） |
| `autoBet/arbExecutionTrace.ts` | 套利进度 trace 类型与 `createArbExecutionTrace` |
| `autoBet/arbProgressTrace.ts` | `beginArbExecutionTrace`（接 messageStore / notify） |
| `autoBet/phases/prepareArbAttempt.ts` | 选腿、选号、linkId |
| `autoBet/phases/checkArbLegs.ts` | 预检 + checkTimeout |
| `autoBet/phases/placeArbLegs.ts` | 下单（并行/串行/单边）+ retryFailedLeg |
| `autoBet/phases/finalizeArbBet.ts` | 拒单 wait、绑单、补单入队、成功标记 |
| `autoBet/makeUp.ts` | 补单阈值 + 入队 |
| `autoBet/rejectWait.ts` | 成功后拒单等待 |
| `autoBet/venueRejectSync.ts` | `updateVenueOrders` + `isVenueReject`（套利/补单共用） |
| `autoBet/retryFailedLeg.ts` | `anyOdds` 失败腿换平台重试 |
| `loseOrder.ts` | 补单队列处理 |
| `manualBet.ts` | 双击手动下单 |
| `betFilters.ts` | `passesDefaultOddsAccount` 薄包装（规则在 `domain/betting/betFilters`） |
| `successMarkers.ts` | 成功标记、`BETACCOUNT` sessionStorage |

### `extensions/`（扩展能力，非调度模式）

| 路径 | 用途 |
|------|------|
| `extensions/arbOpportunity/` | 套利机会检测（`detect`）；kakaxi `detectFeed` 可消费 |
| `extensions/arbMarketWatch/` | 非投注时全盘口 Telegram 盯盘 |
| `extensions/arbBet/` | BetRow UI 增强 |
| `extensions/notify/` | Telegram 格式化与配置；trace 正文见 `formatArbProgress.ts` |

依赖方向：`domain` ← `stores/betting` ← `extensions`（下注编排不 import notify；`messageStore` 负责投递 Telegram）。

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
| `betTiming.ts` | 下注通知时长、`lastOdds`、`BETCOUNT`（对齐 A8 `T()`） |
| `a8MatchTime.ts` | 采集开赛时间窗（复用 `@changmen/shared` + 过去 12h 下限） |
| `arbBetTraceFormat.ts` | trace 事件文案（`formatBetResult` / `formatLegAccount`） |
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
7. `server/backend` — `platform_sync.js` 加 `syncXxxFromEnv` 并在 `ensurePlatformCredentials` 中调用
8. UI — 采集开关、账号卡片（通常随 `ALL_PLATFORMS` 自动出现）

---

## 相关脚本

- 开发：`npm run dev`（Vite：Win `5274` / 其它 `5174`，`/` base）
- 构建：`npm run build`
- 依赖基线：`npm run analyze:deps`（在 `changmen/` 根目录；`--check` 校验架构硬规则，违规非零退出）
- 后端代理：见 `vite.config.ts` 中 `/esport` → `VITE_API_PROXY`

---

## 依赖基线（批次 5f，2026-06-18）

在 `changmen/` 执行 `npm run analyze:deps`，或于 `client/web/` 执行 `npm run analyze:deps:check`。脚本输出模块规模、分层流向、stores/extensions 边，并校验下列**硬规则**（违反则 exit 1）：

| 规则 ID | 约束 |
|---------|------|
| `domain-no-stores` | `domain/*` 不得 import `stores/*` |
| `types-no-stores-extensions` | `types` 不得 import `stores/*` 或 `extensions/*` |
| `betting-no-notify` | `stores/betting` 不得 import `extensions/notify`（trace 已迁至 `autoBet/`） |

**当前快照**（`analyze-module-deps.mjs` 一次运行）：

| 指标 | 值 |
|------|-----|
| 最大模块（文件数） | `stores/betting`（55） |
| 入度最高 | `types`（28）、`shared`（20） |
| `stores/betting` 外向依赖 | `domain/*`、`extensions/arbOpportunity`、`stores/*`（无 `extensions/notify`） |
| 顶层分层 | `domain → models, shared, types`；`types → shared` |
| 入口链 | `main → App, chrome-plugin, lib, router, stores/user` |

**有意保留的跨层依赖**（不在 `--check` 中禁止，勿强行拆）：

| 来源 | 目标 | 原因 |
|------|------|------|
| `stores/message` | `extensions/notify`、`extensions/arbMarketWatch` | Telegram / 盯盘投递层 |
| `stores/betting` | `extensions/arbOpportunity` | kakaxi `detectFeed` 检测输入；调度仍在 `kakaxi/` |
| `extensions/arbOpportunity` | `stores/betting/kakaxi`、`stores/config` | `syncArbRuntime` 启停 kakaxi / 盯盘 |
| `extensions/arbBet/ui` | `stores/match`、`stores/odds`、`stores/account` | BetRow Vue 组合式，读 store 状态 |
| `extensions/notify` | `stores/betting/autoBet/*` | 仅 **类型/trace API** 与格式化，非调度 |

`extensions/*` 整体可依赖 `stores/*`（UI / 运行时同步）；`stores/betting/autoBet` 与 `extensions/notify` 之间仅允许 **messageStore 投递** 方向，不允许 autoBet 直接 import notify。

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

主站登录与 v4 登录账号不同；本地 Vite（Win `:5274` / 其它 `:5174`）默认**浏览器直连** `https://api.a8.to/v4.0/`（对齐 A8 bundle）；仅 `VITE_V4_PROXY=1` 时走 `/v4.0/` 经 backend 代理。

**联调状态**：`user/account/login` 第一步已通过（2026-05-26）。完整流程、环境与验收见 [docs/CREDIT_PLATE.md](../docs/CREDIT_PLATE.md)。

业务代码可继续 `import { … } from "@/api/esport"`，或按域从 `@/api/match` 等直接引用。
