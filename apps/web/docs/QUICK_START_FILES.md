# 5 分钟文件导航（apps/web）

> 外行友好：不用背 180 个文件，按你的角色只打开下面几行即可。  
> 总架构见 [`src/ARCHITECTURE.md`](../src/ARCHITECTURE.md)。  
> **平台采集/下注 canonical 源码**在 [`../../../packages/platform-adapter/`](../../../packages/platform-adapter/README.md)（Vite 别名 `@platform`）。

---

## 先记 4 条线（30 秒）

| 你想… | 文件夹 |
|--------|--------|
| 调**你们后端** | `src/api/` + `src/types/` |
| **抓**各平台赔率 | `../../../packages/platform-adapter/{平台}/frontend/` |
| **下单** | `../../../packages/platform-adapter/{平台}/frontend/bet.ts` + `src/runtime/providers.ts` |
| **看页面** | `src/views/` + `src/components/` + `src/stores/` |

实时赔率在内存里：`src/stores/oddsStore.ts`（对齐 A8 的 `fo`）。  
界面上的比赛行：`src/models/match.ts`（从 fo 读赔率显示）。

---

## 场景 A：只运维 / 排查 OB

**目标**：采集有没有跑、赔率有没有进 fo、MQTT 有没有断。

按顺序打开（约 5 个文件 + 1 份文档）：

| 顺序 | 文件 | 看什么 |
|------|------|--------|
| 1 | [`docs/platforms/OB.md`](./platforms/OB.md) | 流程总览 |
| 2 | [`packages/platform-adapter/ob/frontend/collect.ts`](../../../packages/platform-adapter/ob/frontend/collect.ts) | 30s 轮询、`runPool`、何时拉比赛 |
| 3 | [`packages/platform-adapter/ob/frontend/markets.ts`](../../../packages/platform-adapter/ob/frontend/markets.ts) | `game/view` → `oddsStore.save` → `saveBets` |
| 4 | [`packages/platform-adapter/ob/frontend/mqtt.ts`](../../../packages/platform-adapter/ob/frontend/mqtt.ts) | relay 订阅、3 个 `/market/*` |
| 5 | [`src/stores/oddsStore.ts`](../src/stores/oddsStore.ts) | `OddsEntry` 结构、`save` / 锁盘 |
| 6 | [`src/api/match.ts`](../src/api/match.ts) | `saveMatch` / `saveBets` 调后端 |

**后端 / 探针（不在 app 里，但联调常用）**：

- `packages/platform-adapter/ob/backend/scripts/ob_collect_hybrid.js` — `npm run ob:hybrid`（在 `apps/backend/`）
- [PRODUCTION_DEPLOYMENT.md](../../../PRODUCTION_DEPLOYMENT.md) — 生产 relay / 双进程

**暂时不用看**：`packages/platform-adapter/ob/frontend/bet.ts`（那是下注账号，不是采集 token）。

---

## 场景 B：只看界面 / 赔率为什么不变

**目标**：列表、盘口行、双击下单入口。

| 顺序 | 文件 | 看什么 |
|------|------|--------|
| 1 | [`src/views/HomeView.vue`](../src/views/HomeView.vue) | 登录后 `matchStore.startPolling()` |
| 2 | [`src/stores/matchStore.ts`](../src/stores/matchStore.ts) | `getMatchs`、每 200ms `refreshOddsOnBets` |
| 3 | [`src/models/match.ts`](../src/models/match.ts) | `ViewBetItem.getOdds` / `updateOdds` |
| 4 | [`src/components/match/BetRow.vue`](../src/components/match/BetRow.vue) | 赔率格子、`revision` / `tick` 触发刷新 |
| 5 | [`src/stores/oddsStore.ts`](../src/stores/oddsStore.ts) | 数字从哪来 |

**数据从哪进界面**：

```text
packages/platform-adapter/ob → oddsStore.save
       ↓
matchStore.refreshOddsOnBets → ViewBetItem.updateOdds
       ↓
BetRow → item.getOdds()
```

---

## 场景 C：只对接后端 API（不写采集）

**目标**：登录、拉合并后的比赛、存订单。

| 顺序 | 文件 | 看什么 |
|------|------|--------|
| 1 | [`src/api/client.ts`](../src/api/client.ts) | token、`post` |
| 2 | [`src/api/auth.ts`](../src/api/auth.ts) | 登录 |
| 3 | [`src/api/match.ts`](../src/api/match.ts) | `Client_GetMatchs` / SaveMatch / SaveBet |
| 4 | [`src/types/esport.ts`](../src/types/esport.ts) | `ClientMatchDto`、`BetRowDto` 字段 |
| 5 | [`src/api/esport.ts`](../src/api/esport.ts) | 统一 export（可选） |

**不用看**：整个 `packages/platform-adapter/`（那是浏览器里抓盘，不是后端 REST 定义）。

---

## 场景 D：改某平台采集逻辑

| 顺序 | 文件 | 看什么 |
|------|------|--------|
| 1 | [`packages/platform-adapter/registry/adapters.ts`](../../../packages/platform-adapter/registry/adapters.ts) | 平台是否注册采集/下注 |
| 2 | [`src/runtime/collectors.ts`](../src/runtime/collectors.ts) | `buildCollectorFactories()` 启停 |
| 3 | [`packages/platform-adapter/{平台}/frontend/collect.ts`](../../../packages/platform-adapter/) | 该平台轮询/WS |
| 4 | [`docs/platforms/A8_COMPARE_*.md`](./platforms/) | 对齐审计（运维可选） |

---

## 常见路径对照（旧 → 新）

| 旧文档路径 | 现路径 |
|------------|--------|
| `src/collectors/ob/` | `packages/platform-adapter/ob/frontend/` |
| `src/collectors/docs/` | `docs/platforms/` |
| `src/platforms/registry.ts` | `packages/platform-adapter/registry/adapters.ts` |
| `packages/platform-adapter/ob/backend/` | `packages/platform-adapter/ob/backend/` |

---

## 其它

| 文件 | 何时读 |
|------|--------|
| `packages/platform-adapter/ob/frontend/matches.ts`（若存在）或 collect 内 HTTP | 从 OB 网站拉 `game/index` |
| `docs/platforms/A8_COMPARE_*.md` | 对齐审计，日常运维不必读 |
| 其它平台 `packages/platform-adapter/pb`、`tf`… | 除非你正在改该平台 |
