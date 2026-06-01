# gamebet_frontend/app 架构说明

本文档描述 `src/` 目录的职责划分与数据流，便于新增平台或排查问题。

**外行快速导航（按角色 5 分钟读文件）**：[`docs/QUICK_START_FILES.md`](../docs/QUICK_START_FILES.md)

## 四条主线

```
┌──────────────────────────────────────────────────────────────────┐
│ ① 本系统 API     api/ + types/     →  gamebet_backend /esport、/v4.0 │
│ ② 比赛列表       后端 FeedHub + bridge → matches.json（非前端主责） │
│ ③ 赔率上报       collectors/{平台}/ → SaveBet（+ oddsStore / fo）   │
│ ④ 平台下注       providers/          →  场馆 gateway + 账号 token │
│ ⑤ UI 编排        stores/ + views/ + components/                  │
└──────────────────────────────────────────────────────────────────┘
```

| 目录 | 职责 | 典型入口 |
|------|------|----------|
| `api/` | 封装 `Client_*` 等后端接口 | `api/esport.ts`（barrel）→ `client` / `auth` / `match` / … |
| `api/v4.ts` | A8 v4 信用盘试玩（平博/OB/SABA） | `enterCreditPlate` — 详见 [docs/CREDIT_PLATE.md](../docs/CREDIT_PLATE.md) |
| `types/` | DTO、用户配置、纯类型 | `types/collect.ts`, `types/esport.ts` |
| `models/` | 带方法的领域类 | `PlatformAccount`, `BetOption` |
| `platforms/` | **平台清单、能力与平台实现** | `registry.ts`, `ob/collector`, `ob/provider` |
| `shared/` | **横切工具**（与采集/下注无关） | `format`, `platformHttp`, `platforms/pbHeaders` |
| `runtime/` | **运行时入口注册** | `runtime/collectors.ts`, `runtime/providers.ts` |
| `platforms/*/collector/` | **赔率上报链路**（连接平台源站；主写 `SaveBet`） | `start*Collector` |
| `platforms/shared/` | **仅采集专用** | `collectSession`, `collectNotify` |
| `platforms/*/provider/` | **下注**：预检、下单、余额 | `provider/index.ts` |
| `stores/` | Pinia 状态与编排 | `matchStore`, `accountStore`, `bettingStore` |
| `collectors/hg/followLoop.ts` | HG 跟单循环（原 services） | `startHgFollowLoop` |

**原则**：`providers` 不放进 `collectors`；二者都可用 `shared/`，但不应让 `providers` 依赖 `collectors/shared`。

### 平台能力矩阵（`platforms/registry.ts`）

| 平台 | 采集 | 下注 | 备注 |
|------|------|------|------|
| OB / IM / RAY / TF / IA / SABA / PB / IMT / HG | ✓ | ✓ | |
| XBet | ✓ | — | A8 Socket 频道，无 provider |
| Stake | ✓ | ✓* | *仅 A8 插件，provider 为占位 |

`ALL_PLATFORMS`、`PLATFORMS` 均从 registry 导出；新增平台时只改 `PLATFORM_REGISTRY` 一处，并注册 `collectors/index` 与 `providers/index`。

账号鉴权（与采集解耦）：`platforms/pb/auth.ts`、`platforms/tf/auth.ts` ← `platformHttp` 与采集侧共同使用。

---

## 数据流

### 比赛列表（后端入库，Changmen 主路径）

```
各平台 feed (gamebet_backend/platforms/*)
         ──► FeedHub 快照
         ──► feed_bridge（ESPORT_BRIDGE=1）
         ──► store.saveMatches → matches.json
         ──► Client_GetMatchs
         ──► matchStore（前端只读列表）
```

入库时间窗校验在 `store.saveMatches`（过期赛程不写入）。

### 赔率上报（前端）

```
场馆 API / WS / MQTT ──► collectors/{平台}/
         ──► 解析为 CollectBetDto（+ 本地 oddsStore）
         ──► collectStore.saveBets（开关控制）
         ──► api/esport API_SaveBet
         ──► backend bets.json
         ──► Client_GetMatchs 合并 → UI
```

上报开关：`collectStore` + `collectors/index.ts`。语义是“是否调用 `saveBets` 写入后端”，不是“是否连接平台拉赔率”。  
历史代码里仍有 `saveMatch` 调用；**比赛列表以服务端 `matches.json` 为准**。

### 下注（出单）

```
UI 点击 ──► accountStore.checkBetting / betting
        ──► providers/{平台}Provider (checkBet / betting / getBalance)
        ──► shared/platformHttp (账号 gateway + token + 代理)
        ──► 场馆 API
```

账号模型：`models/platformAccount.ts`；列表与选中：`accountStore`。

### 用户信息与延迟显示（`Client_GetUserInfo`）

- 对齐 A8：延迟值来自统一请求封装 `api/client.ts` 的 `post()` 耗时采样。
- 每次任意 API 请求完成后，`post()` 会更新 `userStore.apiDelay`（用于右上角 `xxms` 显示）。
- 不再使用定时 `Client_GetUserInfo` 心跳探针，因此不会出现该接口高频轮询。

---

## 目录约定

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
| `bracketForm.ts` | 嵌套 form-urlencoded（SABA 等） |

### `platforms/{平台}/collector/`

| 文件 | 用途 |
|------|------|
| `index.ts` | `startXxxCollector()` 入口 |
| `http.ts` | 采集 HTTP（常 import `@/shared/http`） |
| `matches.ts` / `markets.ts` | OB：比赛列表入库（`game/index`）、盘口灌 fo（`game/view`） |
| `paths.ts` / `auth.ts` / `headers.ts` | 协议细节（按需） |
| `parse.ts` / `mqtt.ts` | 解析或推送；MQTT 同步入口在 `mqtt.ts`（如 OB） |

`platforms/shared/` 仅保留：

- `collectSession.ts` — 解析 PB/IMT 等采集用 gateway+token
- `collectNotify.ts` — 采集错误 → Telegram

### `platforms/a8/`

A8 Socket 插件桥（`pluginBridge`, `socketHub`, `betsCollect`）。`im/`、`xbet/` 等为 A8 通道上的薄采集入口。

### `platforms/{平台}/provider/`

每个平台一个 `*Provider.ts`，实现 `PlatformProvider`（`types.ts`）：

- `checkBet` / `betting` / `getBalance`
- 使用 `@/shared/platformHttp`，**不**走采集配置

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
3. `collectors/{平台}/` — `index.ts` + `http.ts`（及 paths/parse 等）
4. `platforms/{平台}/index.ts` — 导出平台 plugin
5. `runtime/collectors.ts` / `runtime/providers.ts` — 注册平台 plugin
6. `gamebet_backend` — `platforms.json` / 合并逻辑（若需要）
7. UI — 采集开关、账号卡片（通常随 `ALL_PLATFORMS` 自动出现）

---

## 相关脚本

- 开发：`npm run dev`（Vite 5174，`/app/` base）
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

- `providers/` 保持平铺 `obProvider.ts` 即可（一平台一文件）
- `src/utils/` 为历史残留目录，**无引用**，可整目录删除
