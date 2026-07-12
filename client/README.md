# client/ 导航

changmen 客户端对标 A8 前端 bundle（本地参考：`A8/index0706.js` 或 `A8/A8frontendscipts/2.0.1/index.js`）。  
A8 是**单文件单体**；changmen 拆成三个目录，但**逻辑模块**应与下表一致。

```
client/
├── web/                 # Vue 控制台（≈ A8 bundle 的 UI + store + 编排）
├── venue-adapter/       # 各平台采集/下注（≈ A8 bundle 内的平台段）
└── chrome-extension/    # MV3 跨域代理（≈ A8 Zn 插件）
```

依赖方向（目标态）：`web` → `client-core` → `venue-adapter` → 场馆 API；`venue-adapter` **不应** `import "@/"`（已由 `check:boundaries` 强制）。

---

## A8 符号 ↔ changmen 对照（index0706 实测）

### Pinia store（A8 仅 7 个）

| A8 Pinia id | A8 变量 | 职责 | changmen |
|-------------|---------|------|----------|
| `"counter"` | `p` / `Qn()` | **实时赔率** `save` / `clean` / `isOdds` | `web/src/stores/oddsStore.ts`（id `"odds"`） |
| `"account"` | `h` / `fo()` | 账号 + `checkBetting` + `betting` | `web/src/stores/accountStore.ts` + `account/*` |
| `"match"` | `hg` | 赛事列表 + **主循环 `O()`** + 初赔 Map | `matchStore.ts` + `match/mainBetLoop.ts` |
| `"user"` | `g` / `Pn()` | 登录态 + **`config`** + proxy/telegram | `userStore.ts`（`config` 真相源）；`configStore` 为兼容门面 |
| `"collect"` | `Md()` | 采集门控 + 上报 | `collectStore.ts` |
| `"loseorder"` | `y` / `Sv()` | 补单队列 | `loseOrderStore.ts` |
| `"message"` | `v` / `Ha()` | Telegram 通知 | `messageStore.ts` |

**易混点**：旧文档写「`fo` = 赔率」在 **index0706** 中是错的——`fo()` 是**账号 store**，赔率是 `Qn()`（Pinia 名却叫 `counter`）。changmen 用 `oddsStore` + `api/apiDelay.ts` 的 `counter` 拆开，更清晰。

### changmen 扩展 store（A8 无对应 Pinia）

| changmen | 说明 |
|----------|------|
| `configStore` | **门面** → `userStore.config` |
| `bettingStore` | **门面** → `matchStore` 下注 actions |
| `orderStore` | 订单列表 UI / 报表 |

### 主循环（A8 `hg` 内 `O()`）

```
matchStore.runMainLoopTick()
  └── match/mainBetLoop.ts          # ≈ A8 O() 外壳（30s 拉列表、finally wait 100ms）
        └── betting/runArbBetRound.ts
              ├── a8/runA8ArbRound.ts     # for match → for bet
              └── autoBet/executeArbBet.ts # ≈ A8 O() 内单场套利体
                    └── phases/*          # 预检 → 下单 → 拒单/补单
        └── bettingStore.processLoseOrders  # ≈ A8 makeUp 段
```

详见 [`web/src/stores/betting/README.md`](web/src/stores/betting/README.md)。

### 领域类（A8 minified 名）

| A8 | changmen |
|----|----------|
| `If` / `BetOption` | `models/betOption.ts` |
| `Jn` / `BetResult` | `models/betResult.ts` |
| `Ly` / 补单行 | `loseOrderStore` + `models/` |
| `vx` / 绑单 | `api/order.ts` `saveOrderBind` |
| `qm` / `PlatformAccount` | `models/platformAccount.ts` |
| `_n` / `OddsEntry` | `oddsStore` |
| `GetOrderOptions` | `domain/betting/buildOrderOptions.ts` |

### HTTP 层

| A8 | changmen |
|----|----------|
| `Ut.*` | `web/src/api/esport.ts` 等 |
| `Ar.post` | `web/src/api/client.ts` + `shared/a8Axios.ts` |
| `Client_GetMatchs` | `api/match.ts` |
| `API_SaveMatch` / `API_SaveBet` | `api/match.ts` → `collectStore` |

### 平台实现

| A8（bundle 内联） | changmen |
|-------------------|----------|
| 各平台 collect/bet 函数 | `venue-adapter/{平台}/collect.ts`、`bet.ts` |
| 注册表 | `venue-adapter/registry/adapters.ts` |
| 启动采集 | `web/src/runtime/collectors.ts` |
| 注册 provider | `web/src/runtime/providers.ts` |

Vite 别名：`@changmen/venue-adapter` → `client/venue-adapter`。

---

## 四条主线（30 秒）

| 你想… | 打开 |
|--------|------|
| 调后端 API | `web/src/api/` |
| 抓平台赔率 | `venue-adapter/{平台}/collect.ts` → `oddsStore` |
| 下单 | `venue-adapter/{平台}/bet.ts` → `account/betGateway.ts` |
| 自动套利 | `match/mainBetLoop.ts` → `stores/betting/` |
| 看页面 | `web/src/views/`、`components/` |

更细的按角色导航：[`web/docs/QUICK_START_FILES.md`](web/docs/QUICK_START_FILES.md)。

---

## 已知结构债（优化方向）

1. ~~**`venue-adapter` 反向依赖 `web/src` stores**~~ → `@changmen/venue-adapter/shared/webBridge` 注入（2026-07）
2. ~~**`venue-adapter` 反向依赖 `@/models` / `@/types` / `@/shared`**~~ → `@changmen/client-core`（2026-07 阶段 3a）
3. ~~**`venue-adapter` 经 `webBridge.useOddsStore` 读写 fo**~~ → `@changmen/client-core/bridge/oddsAccess`（2026-07 阶段 3b）
4. ~~**`configStore` / `bettingStore` 门面**~~ → 直接 `useUserStore` / `useMatchStore`（2026-07 阶段 3c）
5. **`extensions/`** 是 [changmen 扩展]，不是 A8 调度；调度只在 `stores/betting/a8/`。

边界校验：`npm run check:boundaries`（仓库根目录）。

---

## 相关文档

- [`web/src/ARCHITECTURE.md`](web/src/ARCHITECTURE.md) — `src/` 目录职责
- [`web/docs/A8_PARITY_REGISTRY.md`](web/docs/A8_PARITY_REGISTRY.md) — 对齐总览
- [`docs/TEAM_BOUNDARIES.md`](../docs/TEAM_BOUNDARIES.md) — 客户端/服务端边界
- [`venue-adapter/README.md`](venue-adapter/README.md) — 平台适配器
