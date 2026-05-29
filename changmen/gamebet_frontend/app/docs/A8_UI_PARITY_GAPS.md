# A8 UI / 行为复刻缺口清单

对照基线：`changmen/gamebet_frontend/vendor/ui-bundle/index.js`（与 `/console/` 同源）。  
本清单只列**尚未对齐**或**仅部分对齐**项；数据层/采集/下单见 `MIGRATION.md` 与各 `collectors/docs/*`。

最后更新：2025-05-29（全量 View 映射审计 + Element Plus 样式陷阱 + 残余 UI 缺口）。

---

## 图例

| 符号 | 含义 |
|------|------|
| UI | 结构/样式/组件与 bundle 不一致 |
| 行为 | 交互或业务逻辑与 bundle 不一致 |
| 数据 | 后端或接口导致界面无数据 |
| 暂缓 | 已知差异，刻意保留（本地简化） |

---

## 一、主界面（HomeView）

| 区域 | bundle 组件 | 状态 | 说明 |
|------|-------------|------|------|
| 整体布局 | `el-aside` + `el-header` + `el-main` | 已对齐 | 阶段 1 |
| 比赛卡片 | `.match` / `.bet-title` / `BetRow` | 已对齐 | 阶段 2 |
| 账号横条 | `AccountView` (`bDe`) | 已对齐 | `el-button` + `el-tag` + `el-progress` + `el-tooltip` |
| 版本角标 | `ExtensionsView` (`GHe`) | 基本对齐 | class `version`/`new`；扩展版本来源略有不同 |
| 侧栏用户区 | `UserInfoView` | 已对齐 | 阶段 1–2 |
| 侧栏订单 | `OrderView` | 已对齐 | `el-date-picker` + `el-select` + 刷新按钮 |
| 侧栏补单 | `LoseOrderView` | 已对齐 | class 与 bundle 一致；删除确认改为 `ElMessageBox` |
| 限红弹窗 | `LimitDiagView` | 已对齐 | `el-dialog` |
| 创建补单 | `CreateLoseView` | 已对齐 | `el-dialog` + `el-form` |
| 初赔行 | `defaultOdds` | 基本对齐 | `default_odds.json` 首次写入 + 快照回退；10min 轮询 |
| 手动双击下单 | `prompt` 金额 | 行为对齐 | 与 bundle 一致 |

---

## 二、登录

| 项 | 状态 | 说明 |
|----|------|------|
| `container` + `slogo` + `loginbox` + `el-form` | 已对齐 | 阶段 3 |
| 无独立「登录」标题 | 已对齐 | 已去掉自定义 h2 |

---

## 三、用户中心（UserDiagView）

| Tab | bundle | 状态 | 说明 |
|-----|--------|------|------|
| 弹窗壳 | `el-dialog` 880 / `show-close=false` | 已对齐 | 阶段 4 |
| 排行榜 | `UserRankView` | 已对齐 | `rank` + `el-tag` + `el-button-group` |
| 修改密码 | `UserPasswordView` | 部分 | A8 验证码区为占位；本仓库实现 TOTP（**行为增强**） |
| 消息通知 | `UserMessageView` | 已对齐 | `el-form` |
| 代理配置 | `UserProxyView` | 已对齐 | `el-input` prepend |
| 报表查询 | `UserReportView` | 已对齐 | `el-table` + summary |
| 赛事采集 | `UserCollectView` | 已对齐 | 见 `A8_COLLECT_VIEW_PIXEL_PARITY.md` |
| 操盘 | `TradeView` | 已对齐 | GoEasy `USER`/`TRADE` 通道 + `UserDiagTradeTab` |
| 跟单 | `FollowView` | 已对齐 | `el-form` / checkbox-group |
| 聊天室 | `UserChatMessageView` | 已对齐 | `top`/`log`/`filter`/`tags` 布局 |
| 钱包 | `UserWalletView` | 已对齐 | `wallets` + `el-input` prepend |

---

## 四、账号与资金（AccountView 生态）

| 项 | bundle | 状态 | 说明 |
|----|--------|------|------|
| 充提子表单 | `MoneyInfoView` | 已对齐 | `MoneyInfoDialog` → `el-dialog` + Element 表单 |
| 充提列表 | `MoneyView` (`fDe`) | 已对齐 | `MoneyLogDialog` → `el-dialog` + `el-statistic` + `el-table` + `MoneyRiskView` |
| 风险标签 | `MoneyRiskView` | 已对齐 | `MoneyRiskView` + `Client_GetPlayerOrder` 返回 `{ logs, orders }` |
| 账号编辑 | `AccountInfoView` / `bK` | 基本对齐 | `AccountEditDialog` |
| 充提流水列表 | `MoneyLog` 相关 | 基本对齐 | `MoneyLogDialog` |

---

## 五、参数配置（UserConfigView）

| 项 | 状态 | 说明 |
|----|------|------|
| 表单栅格 / fieldset / 保存按钮 | 已对齐 | `UserConfigDialog` |
| 配置项字段 | 已对齐 | 与 `userConfig.ts` 一致 |

---

## 六、自动投注 / 补单（行为，非纯 UI）

| 项 | bundle | 状态 | 说明 |
|----|--------|------|------|
| `betSorting: WinRate` | 有 | 已对齐 | `sortOptionsByWinRate`（`oJe`） |
| `anyOdds` 被拒重试 | 有 | 已对齐 | `retryFailedLegWithAnyOdds`（最多 3 轮换平台） |
| `makeUp_defaultOdds` / `makeUp_odds` | 有 | 已对齐 | `allowMakeUpForLeg` + `Client_GetDefaultOdds` |
| 账号 `minDefault` / `maxDefault` | 有 | 已对齐 | 主循环与补单选账号 |
| `allowSameBet` / `noSameBet` | 有 | 部分 | 使用 `noSameBet` + sessionStorage；命名与 bundle 略有差异 |
| `noSameProvider` | 有 | 部分 | 补单路径有；主循环需再核对 |
| 定时开启投注 | 有 | 已对齐 | `bettingStore.tickAutoOpen` |
| HG 采集 | `SQ` | 占位 | 无赔率流，仅占位 |
| Stake 下单 | 插件 | **暂缓** | `stakeProvider` 占位 |

---

## 七、建议优先级

详见 [A8_NEXT_STEPS.md](./A8_NEXT_STEPS.md)。

1. **P0/P1 UI**：已完成
2. **初赔 + WinRate + 补单阈值**：已完成（`default_odds.json`）
3. **待做**：`anyOdds`、`lastOdds`、UI 图标资源
4. **P3**：Stake 插件下单

---

## 八、验收方式

```bash
cd changmen/gamebet_frontend
npm run app:dev
# 新：http://localhost:5174/app/
# 旧：http://localhost:3456/console/  （需 PATCH_CONSOLE=1 + 后端 3456）
```

同屏对比：登录页、侧栏用户区、用户中心各 Tab、顶栏账号卡、赛事列表 BetRow、订单区。

```bash
cd changmen/gamebet_frontend/app
node scripts/audit-a8-parity.mjs
# → docs/A8_PARITY_AUDIT_MACHINE.json
```

---

## 九、2025-05 复审计结论

### 9.1 组件覆盖（结构层）

- bundle 内 **25 个 `*View`** 均已映射到 Vue 组件（`A8_PARITY_AUDIT_MACHINE.json` → `vueMap`，`unmappedViews: []`）。
- `a8.css` 与官方 `index.css` **1816 个选择器一致**（机器审计差异为 0）。
- 审计里 `bundleSemanticClassesMissingInVue` 多为 class 字符串写法差异（如 `balance trx`），不代表 DOM 缺失。

### 9.2 全局样式 / Element Plus 迁移

| 项 | 状态 | 说明 |
|----|------|------|
| `.el-tabs--top { column-reverse }` | **已修** | `a8-fallback.css` 改回 `column`，否则 Tab 在底部 |
| 其它 EP 不兼容规则 | 待观察 | 再出现布局颠倒时优先查 `a8-fallback` |

### 9.3 仍存在的 UI / 视觉差异

**P1 — 资源与图标**

| 区域 | 说明 |
|------|------|
| `am-icon` / `iconfont-base` | 未打包 A8 字体；`a8-icon-fallback.css` 用 Unicode 代替，观感与 `/console/` 不完全一致 |
| IM 角标 | 缺图时用蓝底「IM」字（`app.css`） |
| `/esport2/assets/*` | dev 需能访问后端静态资源，否则背景/字体可能裂图 |

**P2 — Vue 独有或与 A8 不同**

| 区域 | 说明 |
|------|------|
| 主列表无赛事 | 已对齐空列表（仅保留错误提示条） |
| 操盘 Tab | 「暂无在线用户」提示；A8 无 |
| 钱包刷新 | 点击 toast 占位；A8 按钮也无链上刷新逻辑 |
| 钱包地址生成 | A8 用 TronWeb；复刻为本地假地址（布局同，地址不同） |
| 谷歌验证码 | 复刻为动态 TOTP + 可添加；A8 为静态空码（**增强**，非缺口除非要像素级空码） |

**P3 — 建议同屏 pixel diff**

账号编辑、充提弹窗、初赔数据表现、版本角标逻辑、少量 `scoped` 样式（`HomeView` / `UserDiagTradeTab` / `LoginView`）。

### 9.4 勿误判为缺口（与 A8 相同）

- `Select` / `Pick a month` / `Select date and time`：bundle 原文即英文。
- 补单删除、账号注销：`MessageBox.confirm` 与 A8 一致。
- 侧栏统计三列 + 延迟按钮配色：与 `UserInfoView` 一致。

### 9.5 建议下一步（仅 UI）

1. 同屏 `/console/` vs `/app/` 走一遍 11 个用户中心 Tab + 主界面关键路径。
2. 图标一致：纳入 A8 字体资源，缩小 `a8-icon-fallback`。
3. 钱包地址一致：接入 TronWeb 生成（行为改动，影响钱包 Tab 展示）。
