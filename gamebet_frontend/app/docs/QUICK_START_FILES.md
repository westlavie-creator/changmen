# 5 分钟文件导航（gamebet_frontend/app）

> 外行友好：不用背 180 个文件，按你的角色只打开下面几行即可。  
> 总架构见 [`src/ARCHITECTURE.md`](../src/ARCHITECTURE.md)。

---

## 先记 4 条线（30 秒）

| 你想… | 文件夹 |
|--------|--------|
| 调**你们后端** | `src/api/` + `src/types/` |
| **抓**各平台赔率 | `src/collectors/` |
| **下单** | `src/providers/` |
| **看页面** | `src/views/` + `src/components/` + `src/stores/` |

实时赔率在内存里：`src/stores/oddsStore.ts`（对齐 A8 的 `fo`）。  
界面上的比赛行：`src/models/match.ts`（从 fo 读赔率显示）。

---

## 场景 A：只运维 / 排查 OB

**目标**：采集有没有跑、赔率有没有进 fo、MQTT 有没有断。

按顺序打开（约 5 个文件 + 1 份文档）：

| 顺序 | 文件 | 看什么 |
|------|------|--------|
| 1 | [`src/collectors/docs/OB.md`](../src/collectors/docs/OB.md) | 流程总览 |
| 2 | [`src/collectors/ob/index.ts`](../src/collectors/ob/index.ts) | 30s 轮询、`runPool`、何时 `fetchMatches` |
| 3 | [`src/collectors/ob/markets.ts`](../src/collectors/ob/markets.ts) | `game/view` → `oddsStore.save` → `saveBets` |
| 4 | [`src/collectors/ob/mqtt.ts`](../src/collectors/ob/mqtt.ts) | relay 订阅、3 个 `/market/*` |
| 5 | [`src/stores/oddsStore.ts`](../src/stores/oddsStore.ts) | `OddsEntry` 结构、`save` / 锁盘 |
| 6 | [`src/api/match.ts`](../src/api/match.ts) | `saveMatch` / `saveBets` 调后端 |

**后端 / 探针（不在 app 里，但联调常用）**：

- `changmen/gamebet_backend/platforms/ob/ob_collect_hybrid.js` — `npm run ob:hybrid`
- `DEPLOYMENT.md`（仓库根）— 必须先起 relay

**暂时不用看**：`providers/obProvider.ts`（那是下注账号，不是采集 token）。

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
collectors/ob → oddsStore.save
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

**不用看**：整个 `collectors/`（那是浏览器里抓盘，不是后端 REST 定义）。

---

## 场景 D：只关心 OB 下单

| 顺序 | 文件 | 看什么 |
|------|------|--------|
| 1 | [`src/providers/obProvider.ts`](../src/providers/obProvider.ts) | 余额、验盘、`betting`、`getOrders` |
| 2 | [`src/shared/platformHttp.ts`](../src/shared/platformHttp.ts) | 账号 gateway + token |
| 3 | [`src/models/platformAccount.ts`](../src/models/platformAccount.ts) | 账号字段、`checkOdds` |
| 4 | [`src/stores/accountStore.ts`](../src/stores/accountStore.ts) | 账号列表、发起下注 |
| 5 | [`src/models/betOption.ts`](../src/models/betOption.ts) | 单次下单参数 |

采集凭证在 `getCollectPlatform`，下注凭证在剪贴板 `ACCOUNT`，**两套不要混**。

---

## 三个名字别搞混

| 名字里都有 match/odds | 实际是什么 |
|------------------------|------------|
| `api/match.ts` | 调你们后端的 HTTP |
| `models/match.ts` | 前端展示用的 `ViewMatch` |
| `collectors/ob/matches.ts` | 从 OB 网站拉 `game/index` |

| 赔率 | 在哪 |
|------|------|
| 实时（内存） | `stores/oddsStore.ts` → `OddsEntry` |
| GetMatchs 快照 | `types/esport.ts` → `BetSourceDto.HomeOdds` |
| 采集上报 | `types/collect.ts` → `CollectBetDto` |

---

## 可以先忽略的东西

| 路径 | 原因 |
|------|------|
| `src/collectors/docs/A8_COMPARE_*.md` | 对齐审计，日常运维不必读 |
| `src/utils/` | 文档标明无引用，历史残留 |
| `app/docs/_A8_VS_CHANGMEN_AUDIT.json` | 机器可读缺口，非人工阅读 |
| 其它平台 `collectors/pb`、`tf`… | 除非你正在改该平台 |

---

## 一句话选路径

- **OB 采不上盘** → 场景 A  
- **界面数字不对** → 场景 B  
- **和后端联调接口** → 场景 C  
- **下单失败** → 场景 D  
