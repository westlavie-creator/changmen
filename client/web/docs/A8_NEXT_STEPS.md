# A8 复刻 �?下一步执行清�?
对照基线：`A8/A8frontendscipts/2.0.1/index.js`（只�?bundle�? 
changmen：`http://localhost:5274/`（Win dev）或 `5174`；联�?生产�?backend 同源 `/`

文档索引：[README.md](./README.md)

最后更新：2026-06-11

---

## M1 �?架构冻结�?026-06�?
| �?| 状�?|
|----|------|
| 删除 Node FeedHub / `ESPORT_BRIDGE` | �?|
| 文档：客户端采集 + 服务端聚�?| �?|
| [PRODUCTION_DEPLOYMENT.md](../../../../../PRODUCTION_DEPLOYMENT.md) | �?|
| 生产域名 + 首次 `db push` + 双进程部�?| **待做** |
| 客户端连远程 API 登录 | **待做** |

---

## 已完成（本轮�?
| �?| 说明 |
|----|------|
| 初赔�?| `data/esport/default_odds.json`，首次见到写入；`Client_GetMatchDefaultOdds` / `Client_GetDefaultOdds` 读库 |
| WinRate | `domain/betting/buildOrderOptions` + `shared/winRate.ts`（对�?`oJe`�?|
| 补单阈�?| `makeUp_defaultOdds` / `makeUp_odds` 创建补单�?`processLoseOrders` 前检�?|
| 初赔过滤 | 主循�?/ 补单选账�?`minDefault` / `maxDefault` |
| 初赔轮询 | `matchStore` 独立 10 分钟 timer（对�?bundle�?|
| anyOdds | 一侧失败换平台重试（最�?3 轮） |
| lastOdds | 账号开启后拒同盘更低赔重复下单 |
| 主列表空�?| 去掉加载/无赛提示条（对齐 A8 空列表） |
| 文档 | 本文�?+ `A8_UI_PARITY_GAPS.md` 更新 |

---

## 阶段 A �?收口

- [x] 分批 git commit�?*勿提�?* `data/esport/*.json` 运行时数据）
- [ ] 同屏走查：登�?�?11 Tab �?主界�?BetRow 初赔 �?充提/补单（勾选表�?[A8_WALKTHROUGH_CHECKLIST.md](./A8_WALKTHROUGH_CHECKLIST.md)�?- [x] 历史审计 JSON 已归档（audit 脚本已下线）
---

## 阶段 B �?UI 像素收尾（基本完成）

| # | 任务 | 状�?|
|---|------|------|
| B1 | iconfont / `a8-am-icon.css` | 已完�?|
| B2 | `/esport2/assets/*` dev/prod | 已完�?|
| B3 | 主列表空�?| 已完�?|
| B4 | 同屏 diff：账号编辑、充提弹窗、版本角�?| **待走�?*（见 WALKTHROUGH�?|
| B5 | scoped 样式迁入全局 | 已完�?|

---

## 阶段 C �?初赔深化（部分已完成�?
- [x] `default_odds.json` 首次写入
- [x] `Client_GetDefaultOdds` 实现
- [ ] 可选：按赛事结束清理过�?key；与官方 A8 服对拍长期行�?- [ ] 文档：Network �?10 分钟�?`Client_GetMatchDefaultOdds`（已�?timer�?
---

## 阶段 D �?自动投注行为（剩余）

| # | 任务 | 状�?|
|---|------|------|
| D1 | WinRate | 已完�?|
| D2 | minDefault / maxDefault | 已完�?|
| D3 | makeUp 初赔/当前赔阈�?| 已完�?|
| D4 | `anyOdds` 一侧失败后换平台重�?| 已完�?|
| D5 | `noSameProvider` 主循环与 bundle 再核�?| 已核对：主循环用 `noSameBet`；补单用 `noSameProvider`（与 bundle 一致） |
| D6 | `lastOdds` session 拒单记忆 | 已完�?|

---

## 阶段 E �?平台与信用盘

- [x] 平博 v4 `game/play/Login` E2E（`npm run test:v4`，见 `CREDIT_PLATE.md`�?- [ ] HG 真实赔率采集�?*�?saveMatch**；已做：启用 HG 开关时 60s 刷余额，�?`client/venue-adapter/hg/collect.ts`�?- [ ] Stake 插件下单（暂缓）

---

## 验收命令

```bash
cd changmen/client/web
npm run app:dev
# http://localhost:5274/（Win dev）或 :5174
# 联调/生产：http://localhost:3560/（Win）或 :3456/
```

**初赔 Network**：登录后保留 DevTools �?0 分钟，过�?`Client_GetMatchDefaultOdds`�?
**WinRate**：用户配置选「胜率优先」，初赔两腿�?�?`winRateValue` 时平台顺序应变化�?
**补单**：设 `makeUp_defaultOdds` 小于当前初赔，不应创建补单并应有 tip�?
**平博 v4**（backend 3456 已启动）�?
```bash
cd changmen/client/web && npm run test:v4
```
