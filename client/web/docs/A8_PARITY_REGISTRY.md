# A8 对齐总览（Parity Registry）

**用途**：把 changmen 相对 A8 前端 bundle 的对齐项集中在一处；细节仍见各专题文档。

对照基线：`A8/A8frontendscipts/2.0.1/index.js` + `index.css`（只读）

最后更新：2026-06-16

---

## 图例

| 状态 | 含义 |
|------|------|
| ✅ 已对齐 | 行为与 bundle 可证实一致 |
| ⚠️ 部分 | 主路径对齐，有已知差异 |
| 🔶 扩展 | changmen 有、A8 bundle 无 |
| ⏸ 暂缓 | 刻意不做或资源缺失 |
| 📄 | 详见链接文档 |

标签：`[A8 可证实]` / `[changmen 推测]` / `[changmen 扩展]`（与 `changmen/CLAUDE.md` 一致）

---

## 文档地图（原先分散在哪）

| 文档 | 覆盖范围 |
|------|----------|
| **本文件** | 全量对齐索引 + 配置/时序/投注行为摘要 |
| [A8_UI_PARITY_GAPS.md](./A8_UI_PARITY_GAPS.md) | UI 结构、用户中心 Tab、自动投注行为表、**未对齐/部分**项 |
| [A8_REPLICATE_8_PLATFORMS.md](./A8_REPLICATE_8_PLATFORMS.md) | OB/IM/TF/PB/RAY/IMT/STAKE/IA 采集·下注·回传开关 |
| [A8_OB_REPLICATE_PLAN.md](./A8_OB_REPLICATE_PLAN.md) | OB 专项（MQTT、模式 P、token） |
| [A8_NEXT_STEPS.md](./A8_NEXT_STEPS.md) | 待办、验收命令、阶段勾选 |
| [A8_WALKTHROUGH_CHECKLIST.md](./A8_WALKTHROUGH_CHECKLIST.md) | 同屏走查勾选 |
| [A8_SCRIPT_PLUGIN_PLAN.md](./A8_SCRIPT_PLUGIN_PLAN.md) | 脚本 + Chrome 插件、Mode P |
| [../MIGRATION.md](../MIGRATION.md) | bundle 模块 → changmen 目录映射、阶段进度 |
| [platforms/A8_COMPARE_ALL_PLATFORMS.md](./platforms/A8_COMPARE_ALL_PLATFORMS.md) | 全平台横向对照 |
| [A8_PARITY_AUDIT_MACHINE.json](./A8_PARITY_AUDIT_MACHINE.json) | 机器审计（`npm run audit:a8`） |

---

## 一、架构与数据流

| 项 | A8 | changmen | 状态 |
|----|-----|----------|------|
| 客户端采集 + 服务端聚合 | 浏览器 saveMatch/saveBet → 服务端 GetMatchs | 同 | ✅ |
| CollectConfig 语义 | 仅门控 **回传** API，不停止采集器连接 | `collectStore` + `runtime/collectors` | ✅ [A8 可证实] |
| CollectConfig 空库 seed | 全关，`Client_GetData("CollectConfig")` 回填 | 已对齐 | ✅ |
| matcher / client_matches | bundle 无 | RDS + `server/matcher` | 🔶 [changmen 扩展] |
| 服务端 API 形状 | 由 bundle 反推 | `server/backend` | 📄 [changmen 推测] |

---

## 二、主循环与时序（`Vg` / `P()`）

| 项 | A8 | changmen | 状态 |
|----|-----|----------|------|
| 主循环轮间延迟 | ~100ms | `MAIN_LOOP_DELAY_MS = 100` | ✅ |
| 比赛列表拉取 | 30s 门控 `GetMatchs` | `MATCH_POLL_MS = 30_000` | ✅ |
| 轮间仅刷新赔率 | 非 30s 轮 `updateOdds` | `refreshOddsOnBets` | ✅ |
| 初赔轮询 | 10min | `DEFAULT_ODDS_MS` | ✅ |
| 补单队列 prune | 60s 与列表门控同轮 | `LOSE_ORDER_PRUNE_MS` | ✅ |
| **投注间隔 `betInterval`** | 配置默认 30，**不参与调度** | 同（仅 UI/存库） | ✅ |
| 各平台 saveMatch 间隔 | RAY/Stake/TF 30s；OB/PB/XBet 60s 门控等 | `client/platform-adapter/*` | 📄 [A8_REPLICATE_8_PLATFORMS.md](./A8_REPLICATE_8_PLATFORMS.md) |

实现：`src/stores/match/mainBetLoop.ts`

---

## 三、用户配置 `D8` / `userConfig.ts`

| 配置项 | A8 行为 | changmen | 状态 |
|--------|---------|----------|------|
| 表单字段全集 | UserConfigView | `UserConfigDialog` + `userConfig.ts` | ✅ |
| `waitTime` 加载规范化 | `Number(k)\|\|0` 逐键 | `normalizeWaitTime` + `mergeUserConfig` | ✅ |
| `waitTime` 自动套利通知 `Oe` | `max(wait??0, …, 10)`；`-1` 仍 floor 10 | `arbBetToastSeconds` | ✅ |
| `waitTime` 补单 `Pe` | `-1→0`，否则 `max(wait??0,10)` | `makeUpBetToastSeconds` | ✅ |
| `waitTime` 手动下单 | `betting(_, opt)` 第三参默认 **10**，不读 waitTime | `manualBetToastSeconds()` | ✅ |
| `waitTime` 拒单等待 `q` | 成功腿 `waitTime??5`，`max(...)` | `rejectWaitSeconds` | ✅ |
| 拒单弹窗 countdown | 显示 **Oe**，实际等 **q** | `waitRejectDetection(waitSec, rejectWait)` | ✅ |
| `checkTimeout` | 超时报 tip | `executeArbBet` + `a8Tip` | ✅ |
| `betSorting` / WinRate | `oJe` | `buildOrderOptions` + `winRate.ts` | ✅ |
| `anyOdds` + 重试 | 最多 3 轮换 | `retryFailedLeg` | ✅ |
| `makeUp_*` / `makeProfit` | jb 补单阈值 | `makeUp.ts` + `loseOrder.ts` | ✅ |
| `noSameBet` / `allowSameBet` | sessionStorage `BETACCOUNT:` | `readUsedAccounts` | ✅ |
| `noSameProvider` | 仅补单 | `processLoseOrders` | ✅ |
| `maxBetCount` / `BETCOUNT` | sessionStorage | `betTiming.ts` | ✅ |
| `lastOdds` | 拒更低赔重复 | `passesLastOddsGate` | ✅ |
| 账号 `game[游戏].betCount` | 仅存库/UI；主循环不累计、不拦单 | 同（已删 `GAMEBETCOUNT` 运行时） | ✅ |
| 账号 `rateConfig` 保存时过滤 `rate===0` | `filter(C=>C.rate!==0)` | `normalizeAccountRateConfig` | ✅ |
| 账号 `rate===0` 运行时 | 当 1（全额） | `getBetMoney` 同逻辑 | ✅ |
| **`rate===9999`** | A8 无此语义 | 单边模式：本侧不自动下，对侧真下单 + 负 linkId | 🔶 `extensions/arbBet/rate9999.ts` |

测试：`src/shared/betTiming.test.ts`

---

## 四、自动投注与下单（`Io.betting` / `executeArbBet`）

| 项 | A8 | changmen | 状态 |
|----|-----|----------|------|
| 投注中 loading 通知 | `notification loading ${provider}` | `placeBet` / `betGateway.ts` | ✅ |
| 结果通知 duration | `T===0 ? 3s : T*1s` | `placeBet` | ✅ |
| 并行 / 顺序下单 | `betSorting` Parallel 等 | `executeArbBet` | ✅ |
| 预检超时 | tip 3s | `a8Tip("前置检查超时")` | ✅ |
| 成功后 refreshBalance | 有 | 有 | ✅ |
| 拒单检测 | `updateBalance` → tip(Oe) → wait(q) → `updateOrders` | `refreshBalance` → `waitRejectDetection(Oe,q)` → `updateVenueOrders` | ✅ |
| 四平台 getOrders→reject | OB `bet_status=2`；RAY `status=4`；IA `receive_status=2`；PB `_Q`+缓存 | 同左 + 单元测试 | ✅ |
| 拒单 q<=0 | 仍弹「拒单检测」(Oe)，不 wait | `waitRejectDetection` 同 | ✅ |
| 补单拒单前 refreshBalance | 无 | 无（与 A8 jb 一致） | ✅ |
| 绑单 `SaveOrderBind` | 有绑单行才 POST；空数组跳过 | `api/order.saveOrderBind` | ✅ |
| 随机 `betMoney` | 每 **bet** roll | `prepareArbAttempt` 内 per bet | ✅ |
| 成功后 `fetchOrders` | 无（仅 `updateOrders` 拒单） | 无 | ✅ |
| 双腿 linkId | GetOrderOptions 后 `Date.now()` 正数 | `prepareArbAttempt` 内 `linkTs` | ✅ |
| 9999 单边 linkId | A8 无 | 负数 `-Date.now()`，展示 `gb{ts}` | 🔶 |
| 9999 单边 Telegram | A8 无 | 双腿版式；9999 侧标注不下单 | 🔶 |
| 补单入队 | 一腿成功一腿失败 | `enqueueMakeUpOrder` | ✅ |
| 手动双击下单 | check + betting | `manualBet.ts` | ✅ |
| Telegram 套利扫描 | 无（仅成功推单） | 无 | ✅ |
| 套利执行进度报告 | 无 | `extensions/notify`：单次尝试一份报告（含 prepare 失败）；与 `bettingMessage` 并存 | 🔶 |
| BetRow 套利红线 / flash | bundle 内联 / 无 | `extensions/arbBet/ui` | 🔶 |

实现：`src/stores/betting/autoBet/*`、`src/stores/bettingStore.ts`

---

## 五、补单（`jb`）

| 项 | A8 | changmen | 状态 |
|----|-----|----------|------|
| 队列 session | jb | `loseOrderStore` | ✅ |
| 创建补单 UI | CreateLoseView | CreateLoseDialog | ✅（弹窗字段同 A8；挂载于各 BetRow，非 HomeView 单例） |
| 赔率 / 初赔过滤 | minDefault/maxDefault | `passesDefaultOddsAccount` | ✅ |
| 补单 waitTime | `Pe` 逻辑 | `makeUpBetToastSeconds` | ✅ |
| `isCreateOrder` 跳过拒单复检 | 有 | 有 | ✅ |
| 拒单仍绑单、不移队 | 有 | 有 | ✅ |
| 消费门控 | `makeUp`（不要求 `betting`） | `makeUp` only | ✅ |
| 发布群通知 | 仅 `isCreateOrder` 创建 | 同左 | ✅ |
| 自动入队 | 套利失败即入队（不要求 `makeUp`） | 同左 | ✅ |
| 手动创建赔率 | 切换主客 `maxOdds + 0.5` | `createLoseTargetOdds` | ✅ |
| Follow→补单 | GoEasy `Publish` | 暂缓（非补单核心） | ⏸ |

---

## 六、UI / 用户中心

**完整逐项表** → [A8_UI_PARITY_GAPS.md](./A8_UI_PARITY_GAPS.md) 第一～五节、第九节。

| 区域 | 状态 | 备注 |
|------|------|------|
| HomeView 布局 / BetRow / AccountBar | ✅ | |
| LoginView | ✅ | |
| UserDiag 11 Tab | ✅～⚠️ | 密码 Tab：TOTP 为 **增强** |
| UserConfigDialog | ✅ | |
| 赛事采集 Tab 像素 | ✅ | [A8_COLLECT_VIEW_PIXEL_PARITY.md](./A8_COLLECT_VIEW_PIXEL_PARITY.md) |
| 充提 / 账号编辑 | ⚠️ 基本对齐 | P3 pixel diff |
| HG 采集 | ⚠️ | 无电竞赔率流；60s 余额 |
| CSS 选择器 vs A8 | ✅ 1816 一致 | `npm run audit:a8` |

---

## 七、八平台采集与下注

**总表与验收** → [A8_REPLICATE_8_PLATFORMS.md](./A8_REPLICATE_8_PLATFORMS.md)

| 平台 | 采集 | 下注 | 状态 |
|------|------|------|------|
| OB | HTTP + MQTT | obProvider | ✅ |
| IM | A8 Socket `IM` | imProvider | ✅ |
| TF | REST 30s + WS | tfProvider | ✅ |
| PB | Chrome 扩展 | pbProvider | ✅ 需扩展 |
| RAY | HTTP + SC WS | rayProvider | ✅ |
| IMT | 快照 + Delta | imtProvider | ✅ |
| STAKE | GraphQL + 插件 | stakeProvider | ✅ 需扩展+tab |
| IA | HTTP + WS | iaProvider | ✅ getOrders 已对齐 CYe |

HG / 跟单：⚠️ 见 [platforms/HG.md](./platforms/HG.md)、`hgFollowLoop`

---

## 八、服务端与 matcher（changmen 独有）

| 项 | 说明 | 标签 |
|----|------|------|
| RDS 表 platform_* / client_matches | 合并、prune | 🔶 |
| `list_status = -1` 隐藏 | 等价 A8 列表不可见 | 🔶 |
| legacy json 双写 | 开发用 | 🔶 |

见仓库根 `CLAUDE.md` RDS 与 prune 章节。

---

## 九、已知缺口与暂缓（汇总）

| 项 | 说明 | 文档 |
|----|------|------|
| HG 电竞赔率流 | 仅余额/跟单 | A8_UI_PARITY_GAPS §六 |
| 账号编辑 / 充提 pixel | 同屏 diff | A8_UI_PARITY_GAPS §9.3 |
| 生产部署 / 远程 API 联调 | M1 待做 | A8_NEXT_STEPS |
| Stake / PB 实机 | 依赖扩展与 tabId | A8_REPLICATE_8_PLATFORMS |

**不是缺口**：`betInterval` 不参与调度（A8 同样）；CollectConfig 不关采集器。

---

## 十、验收命令

```bash
# 开发（Win 3560 / 其它 3456）
cd gamebet && BAT\dev.bat parity

# 拒单 / waitTime 单元测试
cd changmen/client/web && npx vitest run src/stores/betting/autoBet/rejectWait.test.ts ../platform-adapter/ob/bet.test.ts ../platform-adapter/ray/bet.test.ts ../platform-adapter/ia/bet.test.ts ../platform-adapter/pb/bet.test.ts ../platform-adapter/pb/rejectPoll.test.ts

# OB 离线 + provider 契约（live GetMatchs 需 RDS 账号，失败时自动跳过）
cd changmen/client/web && npm run test:ob

# 平博 v4 两步（Win 默认 V4_TEST_BASE=http://127.0.0.1:3560/v4.0/）
cd changmen/client/web && npm run test:v4

# UI/View 机器审计
cd changmen/client/web && npm run audit:a8

# 同屏走查（需人工 + 扩展/账号）
# → A8_WALKTHROUGH_CHECKLIST.md + A8_WALKTHROUGH_SCRIPT.md
```

**2026-06-17 自动化验收**：上述 vitest（20）、`test:ob`、`test:v4`、`audit:a8`、`build` 已通过；`Client_Login` live 与四平台实机拒单 E2E 仍依赖 RDS/场馆账号。

---

## 维护说明

1. **新增对齐项**：在本文件对应章节加一行，并在专题 doc 补细节。
2. **仅 UI 像素差异**：只更新 `A8_UI_PARITY_GAPS.md`。
3. **仅单平台**：只更新 `A8_REPLICATE_8_PLATFORMS.md` + 本文件 §七 一行。
4. **changmen 扩展**：必须标 🔶，勿写入「已对齐 A8」。
