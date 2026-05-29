# A8 复刻 — 下一步执行清单

对照基线：`vendor/ui-bundle/index.js` / `http://localhost:3456/console/`  
新前端：`http://localhost:5174/app/`（`npm run app:dev`）

最后更新：2025-05-29

---

## 已完成（本轮）

| 项 | 说明 |
|----|------|
| 初赔库 | `data/esport/default_odds.json`，首次见到写入；`Client_GetMatchDefaultOdds` / `Client_GetDefaultOdds` 读库 |
| WinRate | `getOrderOptions` + `shared/winRate.ts`（对齐 `oJe`） |
| 补单阈值 | `makeUp_defaultOdds` / `makeUp_odds` 创建补单与 `processLoseOrders` 前检查 |
| 初赔过滤 | 主循环 / 补单选账号 `minDefault` / `maxDefault` |
| 初赔轮询 | `matchStore` 独立 10 分钟 timer（对齐 bundle） |
| 文档 | 本文件 + `A8_UI_PARITY_GAPS.md` 更新 |

---

## 阶段 A — 收口（建议立即做）

- [ ] 分批 git commit（**勿提交** `data/esport/*.json` 运行时数据）
- [ ] 同屏走查：登录 → 11 Tab → 主界面 BetRow 初赔 → 充提/补单
- [ ] `node scripts/audit-a8-parity.mjs` 更新 `A8_PARITY_AUDIT_MACHINE.json`

---

## 阶段 B — UI 像素收尾

| # | 任务 |
|---|------|
| B1 | 打包 A8 iconfont，缩小 `a8-icon-fallback.css` |
| B2 | 确认 `/esport2/assets/*` dev/prod 可加载 |
| B3 | 主列表空态：弱化或移除 `.app-hint`（A8 仅空列表） |
| B4 | 同屏 diff：账号编辑、充提弹窗、版本角标 |
| B5 | 减少 `HomeView` / `UserDiagTradeTab` scoped 覆盖 |

---

## 阶段 C — 初赔深化（部分已完成）

- [x] `default_odds.json` 首次写入
- [x] `Client_GetDefaultOdds` 实现
- [ ] 可选：按赛事结束清理过期 key；与官方 A8 服对拍长期行为
- [ ] 文档：Network 约 10 分钟见 `Client_GetMatchDefaultOdds`（已加 timer）

---

## 阶段 D — 自动投注行为（剩余）

| # | 任务 | 状态 |
|---|------|------|
| D1 | WinRate | 已完成 |
| D2 | minDefault / maxDefault | 已完成 |
| D3 | makeUp 初赔/当前赔阈值 | 已完成 |
| D4 | `anyOdds` 一侧失败后换平台重试 | 待做 |
| D5 | `noSameProvider` 主循环与 bundle 再核对 | 待做 |
| D6 | `lastOdds` session 拒单记忆 | 待做 |

---

## 阶段 E — 平台与信用盘

- [ ] 平博 v4 `game/play/Login` E2E（见 `CREDIT_PLATE.md`）
- [ ] HG 真实赔率采集
- [ ] Stake 插件下单（暂缓）

---

## 验收命令

```bash
cd changmen/gamebet_frontend
npm run app:dev
# 新 http://localhost:5174/app/
# 旧 http://localhost:3456/console/  （PATCH_CONSOLE=1 + 后端 3456）
```

**初赔 Network**：登录后保留 DevTools ≥10 分钟，过滤 `Client_GetMatchDefaultOdds`。

**WinRate**：用户配置选「胜率优先」，初赔两腿差 ≥ `winRateValue` 时平台顺序应变化。

**补单**：设 `makeUp_defaultOdds` 小于当前初赔，不应创建补单并应有 tip。
