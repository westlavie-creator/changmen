# gamebet_frontend 文档索引

最后更新：2026-05-29

## 项目共识

**changmen 后端不是 A8 官方服务端的移植**，而是研究 **A8 浏览器前端**（`A8/A8frontendscipts/2.0.1/index.js`）中的 API 名、请求载荷、调用时机 **反推** 出来的本地实现。

| 类别 | 说明 |
|------|------|
| **Parity 唯一基线** | A8 前端 bundle 可证实行为 +（可选）官方站点 Network |
| **changmen 推测** | `matches.json` / `bets.json` / `client_matchs.json`、`match_merge.js` 合并规则、`API_SaveMatch` 落库细节等——以 **满足 A8 前端同款调用与 GetMatchs 响应形状** 为目标，不声称与 A8 服务端同源码 |
| **changmen 扩展** | `ObFeed`、`ESPORT_BRIDGE`、`FeedHub` 仪表盘、多源 `game/index`、`syncObLogin` 等——**不在** A8 bundle 中 |
| **CollectConfig** | A8：`collect: new Map()`，全关，仅 `Client_GetData("CollectConfig")` 回填；changmen 已对齐（空库 seed `collect: []`，前端无 fallback） |

部署上存在两种模式，**不可混为 A8 原版**：

- **模式 P（A8 Parity）**：浏览器 `saveMatch` + `saveBets` + `fo`，与 UMe 一致；parity 验收用此模式。
- **模式 D（Changmen 双轨）**：Node 写比赛列表 + 浏览器写赔率；本地运维/调试便利，**非** parity 基线。

OB 离线验收（`app/` 目录）：`npm run test:ob`（GetMatchs 形态 + obProvider 契约）。  
含 live：`ESPORT_TEST_BASE=http://127.0.0.1:3456 npm run test:ob:all`

详见 [changmen/readme.md](../../../readme.md#项目共识)、OB 专项 [A8_OB_REPLICATE_PLAN.md](./A8_OB_REPLICATE_PLAN.md)。

---

## 对照基线（必读）

| 用途 | 基线 | 说明 |
|------|------|------|
| **新控制台 `/app/` 行为与 UI** | `A8/A8frontendscipts/2.0.1/index.js` + `index.css` | 官方 A8 前端；**不以** `vendor/ui-bundle` 为准 |
| **changmen 后端 API** | 由上述前端 **反推** | **不是** A8 服务端源码；见 [项目共识](#项目共识) |
| **旧控制台 `/console/`** | `vendor/ui-bundle/index.js` → `npm run patch:ui` | 仅双轨对照、patch 联调 |
| **机器审计** | `npm run audit:a8` | 当前脚本仍读 `vendor/ui-bundle` 做 View/class 映射（25 个 View 与 2.0.1 一致）；CSS 对 `index.css` |

代码级缺口（只读审计）：[`_A8_VS_CHANGMEN_AUDIT.json`](./_A8_VS_CHANGMEN_AUDIT.json)  
机器审计输出：[`A8_PARITY_AUDIT_MACHINE.json`](./A8_PARITY_AUDIT_MACHINE.json)

---

## 主文档（维护中）

| 文档 | 用途 |
|------|------|
| [../MIGRATION.md](../MIGRATION.md) | 脱离 bundle 阶段表、模块映射 |
| [A8_NEXT_STEPS.md](./A8_NEXT_STEPS.md) | 待办与验收命令 |
| [A8_UI_PARITY_GAPS.md](./A8_UI_PARITY_GAPS.md) | UI/行为未对齐项 |
| [A8_REPLICATE_8_PLATFORMS.md](./A8_REPLICATE_8_PLATFORMS.md) | 8 平台采集/下注/回传开关语义 |
| [A8_OB_REPLICATE_PLAN.md](./A8_OB_REPLICATE_PLAN.md) | **OB 复刻计划**（A8 前端基线 + changmen 推测/扩展标注） |
| [A8_WALKTHROUGH_CHECKLIST.md](./A8_WALKTHROUGH_CHECKLIST.md) | 同屏走查勾选 |
| [A8_WALKTHROUGH_SCRIPT.md](./A8_WALKTHROUGH_SCRIPT.md) | 走查逐步操作 |
| [A8_COLLECT_VIEW_PIXEL_PARITY.md](./A8_COLLECT_VIEW_PIXEL_PARITY.md) | 赛事采集 Tab 像素与「回传」语义 |
| [CREDIT_PLATE.md](./CREDIT_PLATE.md) | 平博信用盘 v4 |
| [QUICK_START_FILES.md](./QUICK_START_FILES.md) | 5 分钟按角色找源码 |

仓库根：[../README.md](../README.md)、[../VENDOR_UI_REFERENCE.md](../VENDOR_UI_REFERENCE.md)（**仅** `/console/`）

---

## 采集器文档（`app/src/collectors/docs/`）

| 文档 | 用途 |
|------|------|
| [../src/collectors/README.md](../src/collectors/README.md) | 采集器总览、**回传开关** |
| `OB.md` / `RAY.md` / … | 各平台运维 |
| `A8_COMPARE_ALL_PLATFORMS.md` | 全平台 A8 vs changmen |
| `A8_COMPARE_OB_RAY.md` | OB/RAY 详解 |
| `A8_TF_LOGIC_PARITY.md` / `A8_PB_LOGIC_PARITY.md` | TF/PB 逻辑对照 |
| `A8.md` | A8 Socket 聚合框架（IM/XBet/Stake） |

---

## 已删除的过期产物

| 文件 | 原因 |
|------|------|
| `_A8_GAP_AUDIT_FROM_CODE.json` | 一次性对比 vendor vs 2.0.1，无引用；由 `_A8_VS_CHANGMEN_AUDIT.json` 取代 |
| `_A8_VIEW_MARKER_GAPS.json` | 一次性 DOM 标记审计，无引用；缺口已写入 `A8_UI_PARITY_GAPS.md` |
| `collectors/docs/OB_FRONTEND_PLAN.md` | 未审批的实施计划，非现状说明；未勾选项非当前阻塞 |

---

## 术语

用户中心 **赛事采集** 开关 = 是否调用 `Client_SaveMatch` / `Client_SaveBets`（**回传**），不是是否连接场馆或停止 `oddsStore` 更新。
