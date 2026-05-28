# OB 前端架构计划（待审批）

> 基于 A8 对齐后的 `collectors/ob/*`、后端 `platforms/ob/*`，以及探针脚本 `ob_collect_hybrid.js` 实测结论。

---

## 1. 目标

| 目标 | 说明 |
|------|------|
| **数据完整** | HTTP 打底（index/view/timer）+ MQTT 增量（3 个 `/market/*`） |
| **行为对齐 A8** | 采集凭证与下注凭证分离；每场 unsub→view→sub；stage 1.5s |
| **多用户部署** | 浏览器不直连 OB MQTT 源站；走本站 relay + 可选 HTTP relay |
| **可观测** | 采集耗时、506 率、MQTT 断流可日志化 |

---

## 2. 已验证的「获取 OB 数据」方式

### 2.1 双通道模型（推荐，与现实现一致）

```text
┌─────────────────────────────────────────────────────────┐
│ 凭证 A：采集（platforms.json / Client_GetCollectPlatform）│
│   HTTP: gateway + token                                 │
│   MQTT: relay /esport/ws/OB（admin 下游 + 上游 OB token） │
└─────────────────────────────────────────────────────────┘
                          │
          ┌───────────────┴───────────────┐
          ▼                               ▼
   game/index (30s)                  MQTT push
   game/view (每场每 stage)          /market/oddsUpdate
   game/getTimer                     /market/statusUpdate
                                     /market/suspended
          │                               │
          └───────────────┬───────────────┘
                          ▼
                   oddsStore (fo 内存)
                          ▼
              Client_SaveMatch / SaveBet → 后端 JSON
                          ▼
                   matchStore / 主界面盘口

┌─────────────────────────────────────────────────────────┐
│ 凭证 B：下注（ACCOUNT 剪贴板 per 账号）                    │
│   HTTP: account.gateway + token → obProvider            │
└─────────────────────────────────────────────────────────┘
```

### 2.2 探针脚本（Node，可独立验收）

```bash
cd changmen/gamebet_backend
npm run ob:hybrid -- --duration 90 --max-matches 5 --mqtt-mode native
# 或走本站 relay（需先 npm run web）：
npm run ob:hybrid -- --mqtt-mode relay --relay-ws ws://127.0.0.1:3456/esport/ws/OB
```

输出：每行 JSON（`http.index.ok` / `http.match.done` / `mqtt.connect` / `mqtt.message` …）。

**实测摘要（2026-05-27）**：

- `game/index` 正常（76 场）
- `game/view` 部分 **HTTP 506**（网关/限流，与浏览器现象一致）
- **native MQTT** 可连 `wss://…/mqtt`，能收到 `/market/statusUpdate` 等
- 一轮 HTTP 约 20s（2 场 BO3/BO5 + 1.5s×stage）

---

## 3. 前端分层设计（建议）

### Layer 0 — 配置与凭证

| 模块 | 职责 |
|------|------|
| `api/esport.ts` | `getCollectPlatform("OB")`、`getGames`、`saveMatch/saveBets` |
| `api/v4.ts` | `OB_DEMO_LOGIN_URL`、试玩入口 |
| `stores/collectStore.ts` | 采集开关、配置持久化 |

### Layer 1 — 传输（已实现，保持）

| 模块 | 职责 |
|------|------|
| `collectors/ob/http.ts` | 采集 GET（Axios 直连 gateway） |
| `shared/platformHttp.ts` | 下注账号 GET/POST（可选 http-relay） |
| `collectors/ob/mqtt.ts` | relay WS + 订阅 + 3 topic 处理 + debounce 刷新 |
| `providers/obProvider.ts` | 余额 / 验盘 / 下单 / 订单 |

### Layer 2 — 采集编排（已实现，保持）

| 模块 | 职责 |
|------|------|
| `collectors/ob/index.ts` | 30s poll；`runPool` 4 并发；每场 unsub→view→save→sub |
| `collectors/ob/markets.ts` | 解析 view → fo + `CollectBetDto[]` |
| `collectors/ob/matches.ts` | index → `CollectMatchDto` |
| `collectors/ob/helpers.ts` | token 刷新、timer、队徽 |

### Layer 3 — 展示与下注（现有 Home + stores）

| 模块 | 职责 |
|------|------|
| `stores/oddsStore.ts` | fo 真相源；MQTT/HTTP 统一写入 |
| `stores/matchStore.ts` | Client_GetMatchs；`refreshOddsOnBets` |
| `stores/accountStore.ts` | OB 账号 + `getOrders` 刷新 unsettle |
| 主界面组件 | 盘口、锁盘、下单链路 |

### Layer 4 — 可观测（建议新增，审批后做）

| 项 | 说明 |
|----|------|
| `collectors/ob/metrics.ts` | 每轮：index 耗时、view 成功/506 数、MQTT 消息数 |
| 采集设置页 | 并发数、是否仅 relay、诊断按钮调 `ob:hybrid` 结果展示 |
| 后端 health | `/esport/ob-relay-status` 已有则前端拉取展示 |

---

## 4. 目录结构（目标态）

```text
collectors/ob/
  index.ts          # 编排入口
  http.ts           # 采集 HTTP
  mqtt.ts           # MQTT 客户端
  markets.ts        # view 解析
  matches.ts        # index 解析
  helpers.ts        # token / timer / logo
  betNameRe.ts      # BetName 缓存
  parse.ts          # 字段解析
  constants.ts      # POLL_MS、并发数、CLIENT_ID（建议抽出）
  metrics.ts        # [新增] 采集指标
  types.ts          # [可选] ObViewBlock、PollStats

providers/
  obProvider.ts     # 下注

shared/
  platformHttp.ts
  a8Axios.ts
```

`winMarket.ts` 仅保留 GameID 映射；无「主盘选举」。

---

## 5. 关键流程（与 A8 一致）

### 5.1 采集启动

1. 用户登录 → `startObCollector()`（延迟 3s）
2. `connectObMqtt` → `relayWsUrl("/esport/ws/OB")`
3. `poll` 循环 30s

### 5.2 单轮 poll

1. `getCollectPlatform` + `getGames`（并行）
2. `game/index` → 过滤 → `saveMatch`
3. `runPool(4)`：每场 **unsub → loadMarketsForMatch → saveBets → sub**
4. `syncObLiveTimer`
5. `matchStore.fetchMatches(true)`（可按指标降级频率）

### 5.3 用户打开比赛列表

- `syncObMqttSubscriptionsForGetMatchs`：仅 UI 上的 OB 场，unsub→refreshObMatchMarkets→sub

### 5.4 下注

- 不用采集 token；`obProvider` + `platformHttp` + 剪贴板账号

---

## 6. 环境与部署约定

| 场景 | HTTP 采集 | MQTT | 下注 |
|------|-----------|------|------|
| 本地 dev | 浏览器直连 gateway | `ws://127.0.0.1:3456/esport/ws/OB` | 直连或 3456 relay |
| 生产 | 同上 | `wss://{域名}/esport/ws/OB` | 用户代理可选 |

后端必须先起：`npm run web`（`ob_mqtt_relay` + `http-relay`）。

---

## 7. 实施阶段（审批后执行）

### Phase A — 文档与常量（0.5d）

- [ ] 抽出 `ob/constants.ts`（POLL_MS、CONCURRENCY、CLIENT_ID、DEBOUNCE_MS）
- [ ] `OB.md` / `DEPLOYMENT.md` 增加「必须先起 relay」检查清单
- [ ] 采集诊断页链到 `npm run ob:hybrid` 说明

### Phase B — 可观测（1d）

- [ ] `metrics.ts` + 每轮 `console.debug` 结构化一行
- [ ] 506 计数超阈值 → `notifyCollectError` 提示降并发
- [ ] 可选：管理页展示最近一轮 stats

### Phase C — UI 体验（1～2d）

- [ ] `matchStore.fetchMatches` 降频或 diff 刷新（非每轮 force true）
- [ ] 锁盘/赔率变更仅刷新受影响 `ViewMatch` 行
- [ ] OB 账号页展示 `getOrders` unsettle（已接 provider）

### Phase D — 韧性（1d）

- [ ] `game/view` 506 单 stage 失败不拖死整场（可选：部分 saveBets，标为 changmen 增强）
- [ ] MQTT 断线 banner + 自动重连状态
- [ ] token 失效一次重试 index（refresh 后立即重跑当前轮）

### Phase E — 不在此次范围

- 恢复「主盘选举」、跳过 HTTP 仅靠 MQTT
- 直连 `47.115.75.57`（除非客户环境强制）

---

## 8. 验收标准

| # | 标准 |
|---|------|
| 1 | `npm run ob:hybrid` 90s 内至少 1 轮 `http.index.ok` + `mqtt.connect` |
| 2 | 前端采集开 5min：`live_timers.json` / `bets.json` 有 OB 写入 |
| 3 | 主界面赔率随 MQTT 变动（debounce 后可见） |
| 4 | OB 账号刷余额 + unsettle 有数（`getOrders`） |
| 5 | 下单探针 + 正式单走 `obProvider` 成功 |

---

## 9. 需你确认的点

1. **Phase C** 是否允许「506 时仍 saveBets 已成功 stage」？（与 A8 严格一致则否）
2. **fetchMatches(true)** 每 30s 全量是否改为 **60s 或-on-demand**？
3. 诊断脚本默认 **native MQTT** 还是仅文档 **relay**？（生产前端只用 relay）

确认后按 Phase A→B→C 顺序执行。
