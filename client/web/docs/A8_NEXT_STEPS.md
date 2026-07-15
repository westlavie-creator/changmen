# A8 复刻 — 下一步执行清单

对照基线：`A8/A8frontendscipts/2.0.1/index.js`（只读 bundle）  
changmen：`http://localhost:5274/`（Win dev）或 `5174`；联调/生产：backend 同源 `/`

文档索引：[README.md](./README.md)

最后更新：2026-07-15

---

## 当前主线（2026-07-15）

| 项 | 状态 |
|----|------|
| 多运动（棒球/足球 + PM∥PF + N3 + N3.5 实时赔率） | **维护态** — [ARB_MULTI_SPORT.md](../../../docs/ARB_MULTI_SPORT.md)；`marketQuoteHub` 多消费者 → `sportOddsStore`；**电竞实现面冻结**（`esport-freeze.json` + `check:esport-freeze`）；**不开 N4** / Team UI / sport 下注；体育板不写 fo |
| 电竞主线 | **默认工作面** — 阶段 A 同屏走查 → 平台/投注缺口；账号后端见 [ACCOUNT_BACKEND.md](../../../docs/ACCOUNT_BACKEND.md)；动冻结面须 `ALLOW_ESPORT_TOUCH=1` 或 `check:esport-freeze:allow` |
| 下一产品闸门 | 体育 **自动下单** 再单开 **N4**；或新场馆对齐另开 plan |

走查勾选表：[A8_WALKTHROUGH_CHECKLIST.md](./A8_WALKTHROUGH_CHECKLIST.md)  
操作脚本：[A8_WALKTHROUGH_SCRIPT.md](./A8_WALKTHROUGH_SCRIPT.md)  
对齐总览：[A8_PARITY_REGISTRY.md](./A8_PARITY_REGISTRY.md)

**本轮电竞优先（收口）**

1. 登录 → 主界面布局 / 账号条 / BetRow 初赔  
2. 用户中心 11 Tab 快速过一遍（操盘用自建 pub/sub）  
3. 充提 / 参数配置 / 版本角标  
4. 回归：切「棒球/足球」Tab 时电竞 `mainBetLoop` 仍跑（多运动维护态验收）  
5. 账号：`Client_SaveData(ACCOUNT)` 兼容层 / 巡检（勿在前端加 A8 没有的 skip）

---

## M1 — 架构冻结（2026-06）

| 项 | 状态 |
|----|------|
| 删除 Node FeedHub / `ESPORT_BRIDGE` | 完成 |
| 文档：客户端采集 + 服务端聚合 | 完成 |
| [PRODUCTION_DEPLOYMENT.md](../../../PRODUCTION_DEPLOYMENT.md) | 完成 |
| 生产域名 + 首次 `db push` + 双进程部署 | **待做**（上线优先时再开） |
| 客户端连远程 API 登录 | **待做**（上线优先时再开） |

---

## 已完成（历史轮次）

| 项 | 说明 |
|----|------|
| 初赔 | `default_odds.json`，首次见到写入；`Client_GetMatchDefaultOdds` / `Client_GetDefaultOdds` |
| WinRate | `domain/betting/buildOrderOptions` + `shared/winRate.ts`（对照 `oJe`） |
| 补单阈值 | `makeUp_defaultOdds` / `makeUp_odds` |
| 初赔过滤 | 主循环 / 补单选账号 `minDefault` / `maxDefault` |
| 初赔轮询 | `matchStore` 独立 10 分钟 timer |
| anyOdds | 一侧失败换平台重试（最多 3 轮） |
| lastOdds | 账号开启后拒同盘更低赔重复下单 |
| 主列表空态 | 去掉加载/无赛提示条（对齐 A8） |
| Trade / BetTarget | 自建 pub/sub + admin 开关（2026-07） |

---

## 阶段 A — 收口

- [x] 分批 git commit（**勿提交** `data/esport/*.json` 运行时数据）
- [ ] 同屏走查：登录 → 11 Tab → 主界面 BetRow 初赔 → 充提/补单（勾选表见 [A8_WALKTHROUGH_CHECKLIST.md](./A8_WALKTHROUGH_CHECKLIST.md)）
- [x] 历史审计 JSON 已归档（audit 脚本已下线）
- [x] 多运动只读冻结进仓（`10e17fac`，2026-07-15）
- [x] PF 并列 + 赔率解析；体育板 Sources fallback、不 seed fo（维护态收口，2026-07-15）
- [x] N3 sport moneyline 合并（`sport_merge` + MLB 别名 + 异步落库；电竞零交叉，2026-07-15）
- [x] N3.5 体育实时赔率（`marketQuoteHub` + `sportOddsStore`；`SportMatchBoard` 注入 tick；禁 fo；2026-07-15）

---

## 阶段 B — UI 像素收尾（基本完成）

| # | 任务 | 状态 |
|---|------|------|
| B1 | iconfont / `a8-am-icon.css` | 已完成 |
| B2 | `/esport2/assets/*` dev/prod | 已完成 |
| B3 | 主列表空态 | 已完成 |
| B4 | 同屏 diff：账号编辑、充提弹窗、版本角标 | **待走查**（见 WALKTHROUGH） |
| B5 | scoped 样式迁入全局 | 已完成 |

---

## 阶段 C — 初赔深化（部分已完成）

- [x] `default_odds.json` 首次写入
- [x] `Client_GetDefaultOdds` 实现
- [ ] 可选：按赛事结束清理过期 key；与官方 A8 服对拍长期行为
- [ ] 文档：Network 约 10 分钟一次 `Client_GetMatchDefaultOdds`（已有 timer）

---

## 阶段 D — 自动投注行为（剩余）

| # | 任务 | 状态 |
|---|------|------|
| D1 | WinRate | 已完成 |
| D2 | minDefault / maxDefault | 已完成 |
| D3 | makeUp 初赔/当前赔阈值 | 已完成 |
| D4 | `anyOdds` 一侧失败后换平台重试 | 已完成 |
| D5 | `noSameProvider` 主循环与 bundle 再核对 | 已核对：主循环用 `noSameBet`；补单用 `noSameProvider` |
| D6 | `lastOdds` session 拒单记忆 | 已完成 |

---

## 阶段 E — 平台与信用盘

- [x] 平博 v4 `game/play/Login` E2E（`npm run test:v4`，见 `CREDIT_PLATE.md`）
- [ ] HG 真实赔率采集（**含 saveMatch**）；已做：启用 HG 开关时 60s 刷余额，见 `client/venue-adapter/hg/collect.ts`
- [ ] Stake 插件下单（暂缓）

---

## 验收命令

```bash
# 根目录推荐
BAT\dev.bat
# http://localhost:5274/（Win）+ backend :3560
```

```bash
cd client/web
npm run test        # vitest
npm run test:v4     # 平博 v4（需 backend）
npm run typecheck:frontend
```

**初赔 Network**：登录后保留 DevTools ≥10 分钟，过滤 `Client_GetMatchDefaultOdds`。  
**WinRate**：用户配置选「胜率优先」，初赔两腿 `winRateValue` 时平台顺序应变化。  
**补单**：设 `makeUp_defaultOdds` 小于当前初赔，不应进入补单并应有 tip。  
**平博 v4**（backend 已启动）：

```bash
cd client/web && npm run test:v4
```
