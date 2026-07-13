# A8 UI / 行为复刻缺口清单

对照基线：`A8/A8frontendscipts/2.0.1/index.js` + `index.css`�?本清单只�?*尚未对齐**�?*仅部分对�?*项；数据�?采集/下单�?`MIGRATION.md` 与各 `docs/platforms/*`�?
文档索引：[README.md](./README.md)

最后更新：2026-06-16

> **全量对齐索引**（含已对�?+ 扩展 + 配置项）：见 [A8_PARITY_REGISTRY.md](./A8_PARITY_REGISTRY.md)

---

## 图例

| 符号 | 含义 |
|------|------|
| UI | 结构/样式/组件�?bundle 不一�?|
| 行为 | 交互或业务逻辑�?bundle 不一�?|
| 数据 | 后端或接口导致界面无数据 |
| 暂缓 | 已知差异，刻意保留（本地简化） |

---

## 一、主界面（HomeView�?
| 区域 | bundle 组件 | 状�?| 说明 |
|------|-------------|------|------|
| 整体布局 | `el-aside` + `el-header` + `el-main` | 已对�?| 阶段 1 |
| 比赛卡片 | `.match` / `.bet-title` / `BetRow` | 已对�?| 阶段 2 |
| 账号横条 | `AccountView` (`bDe`) | 已对�?| `el-button` + `el-tag` + `el-progress` + `el-tooltip` |
| 版本角标 | `ExtensionsView` (`GHe`) | 基本对齐 | class `version`/`new`；扩展版本来源略有不�?|
| 侧栏用户�?| `UserInfoView` | 已对�?| 阶段 1�? |
| 侧栏订单 | `OrderView` | 已对�?| `el-date-picker` + `el-select` + 刷新；分�?`Link` 降序 + `groupBy(Link)` �?bundle |
| 侧栏补单 | `LoseOrderView` | ⚠️ 部分 | DOM/class �?A8�?*侧栏顺序**�?**fieldset scoped 样式**已按 bundle 对齐�?026-06�?|
| 限红弹窗 | `LimitDiagView` | 已对�?| `el-dialog` |
| 创建补单 | `CreateLoseView` | 基本对齐 | `el-dialog` + `el-form` �?A8；changmen 挂各 `BetRow`（A8 �?HomeView 单例�?|
| 初赔�?| `defaultOdds` | 基本对齐 | `default_odds.json` 首次写入 + 快照回退�?0min 轮询 |
| 手动双击下单 | `prompt` 金额 | 已对�?| 前置 `checkBetting` + `accountStore.betting`（含 loading 通知�?|

---

## 二、登�?
| �?| 状�?| 说明 |
|----|------|------|
| `container` + `slogo` + `loginbox` + `el-form` | 已对�?| 阶段 3 |
| 无独立「登录」标�?| 已对�?| 已去掉自定义 h2 |

---

## 三、用户中心（UserDiagView�?
| Tab | bundle | 状�?| 说明 |
|-----|--------|------|------|
| 弹窗�?| `el-dialog` 880 / `show-close=false` | 已对�?| 阶段 4 |
| 排行�?| `UserRankView` | 已对�?| `rank` + `el-tag` + `el-button-group` |
| 修改密码 | `UserPasswordView` | 部分 | A8 验证码区为占位；本仓库实�?TOTP�?*行为增强**�?|
| 消息通知 | `UserMessageView` | 已对�?| `el-form` |
| 代理配置 | `UserProxyView` | 已对�?| `el-input` prepend |
| 报表查询 | `UserReportView` | 已对�?| `el-table` + summary |
| 赛事采集 | `UserCollectView` | 已对�?| �?`A8_COLLECT_VIEW_PIXEL_PARITY.md` |
| 操盘 | `TradeView` | 已对齐 | changmen pub/sub `USER`/`TRADE` + `UserDiagTradeTab`（对齐 A8 GoEasy 频道语义） |
| 跟单 | `FollowView` | 已对�?| `el-form` / checkbox-group |
| 聊天�?| `UserChatMessageView` | 已对�?| `top`/`log`/`filter`/`tags` 布局 |
| 钱包 | `UserWalletView` | 已对�?| `wallets` + `el-input` prepend |

---

## 四、账号与资金（AccountView 生态）

| �?| bundle | 状�?| 说明 |
|----|--------|------|------|
| 充提子表�?| `MoneyInfoView` | 已对�?| `MoneyInfoDialog` �?`el-dialog` + Element 表单 |
| 充提列表 | `MoneyView` (`fDe`) | 已对�?| `MoneyLogDialog` �?`el-dialog` + `el-statistic` + `el-table` + `MoneyRiskView` |
| 风险标签 | `MoneyRiskView` | 已对�?| `MoneyRiskView` + `Client_GetPlayerOrder` 返回 `{ logs, orders }` |
| 账号编辑 | `AccountInfoView` / `bK` | 基本对齐 | `AccountEditDialog` |
| 充提流水列表 | `MoneyLog` 相关 | 基本对齐 | `MoneyLogDialog` |

---

## 五、参数配置（UserConfigView�?
| �?| 状�?| 说明 |
|----|------|------|
| 表单栅格 / fieldset / 保存按钮 | 已对�?| `UserConfigDialog` |
| 配置项字�?| 已对�?| �?`userConfig.ts` 一�?|

---

## 六、自动投�?/ 补单（行为，非纯 UI�?
| �?| bundle | 状�?| 说明 |
|----|--------|------|------|
| `betSorting: WinRate` | �?| 已对�?| `sortOptionsByWinRate`（`oJe`�?|
| `anyOdds` 被拒重试 | �?| 已对�?| `retryFailedLeg`（最�?3 轮换平台；阈�?`anyOdds ? anyOddsProfit : makeProfit`�?|
| `makeUp_defaultOdds` / `makeUp_odds` | �?| 已对�?| `autoBet/makeUp.allowMakeUpForLeg` + `Client_GetDefaultOdds` |
| 账号 `minDefault` / `maxDefault` | �?| 已对�?| 主循环与补单选账�?|
| `allowSameBet` / `noSameBet` | �?| 已对�?| `pickArbLegs` + `readUsedAccounts`（`BETACCOUNT:` sessionStorage，[A8 可证实]�?|
| `noSameProvider` | �?| 已对�?| 仅补�?`processLoseOrders`；主循环�?`noSameBet`（bundle 同） |
| 定时开启投�?| �?| 已对�?| `bettingStore.tickAutoOpen` |
| `maxBetCount` / `BETCOUNT` | �?| 已对�?| `betTiming.passesMaxBetCount` + `incrementBetCount` |
| 拒单检测主循环 | �?| 已对�?| `refreshBalance` �?tip(Oe) �?wait(q) �?`updateVenueOrders`�?*q<=0 仍弹 tip** |
| 补单拒单复检 | �?| 已对�?| `makeUpBetToastSeconds`（Pe）；复检前不�?refreshBalance（A8 jb 同） |
| `checkTimeout` 弹窗 | �?| 已对�?| `a8Tip("前置检查超�?, �?` |
| 投注�?/ 结果通知 | `Io.betting` | 已对�?| `placeBet`；自动套�?`arbBetToastSeconds`、补�?`makeUpBetToastSeconds`、手动固�?10s |
| `betInterval` | 配置默认 30 | 已对�?| A8/changmen �?*不参与调�?*；主循环 100ms、列�?30s |
| `rateConfig` rate=0 | 保存过滤；运行时�?1 | 已对�?| `normalizeAccountRateConfig` + `getBetMoney` |
| `rate 9999` 单边 / linkId | A8 �?| 🔶 扩展 | `domain/betting/singleLegRate.ts`；比�?9999 = 单边模式；负 linkId �?`gb{ts}` |
| `Pr.tip` 补单/拒单 | �?| 已对�?| `a8Notify.a8Tip`（含 `<countdown>`�?|
| HG 采集 | `SQ` | 部分 | 无电竞赔率流；启用开关时 60s �?HG 账号余额；跟单见 `hgFollowLoop` |
| Stake 下单 | 插件 GraphQL | **已对�?* | `stakeProvider` 完整实现；`pluginOnly` 需 Chrome 扩展 + stake.com 标签页（�?`client/venue-adapter/stake/README.md`�?|

---

## 七、建议优先级

详见 [A8_NEXT_STEPS.md](./A8_NEXT_STEPS.md)、[A8_REPLICATE_8_PLATFORMS.md](./A8_REPLICATE_8_PLATFORMS.md)�?
1. **P0**�? 平台联调 + 走查表（回传开关语义）；Stake 需实机验证插件 tabId + GraphQL 下单
2. **P1 UI**：同�?pixel diff（账号编辑、充提、版本角标）
3. **已完�?*：初�?WinRate/补单阈值、`anyOdds` 重试、`lastOdds`、图标、赛事采�?Tab、拒单检测、投注通知
4. **暂缓**：HG 无电竞赔率流（仅余额轮询�?
---

## 八、验收方�?
历史机器审计见 `docs/A8_PARITY_AUDIT_MACHINE.json`（audit 脚本已下线）。

---

## 九�?026-05 复审计结�?
### 9.1 组件覆盖（结构层�?
- bundle �?**25 �?`*View`** 均已映射�?Vue 组件（`A8_PARITY_AUDIT_MACHINE.json` �?`vueMap`，`unmappedViews: []`）�?- `a8.css` 与官�?`index.css` **1816 个选择器一�?*（机器审计差异为 0）�?- 审计�?`bundleSemanticClassesMissingInVue` 多为 class 字符串写法差异（�?`balance trx`），不代�?DOM 缺失�?
### 9.2 全局样式 / Element Plus 迁移

| �?| 状�?| 说明 |
|----|------|------|
| `.el-tabs--top { column-reverse }` | **已修** | `a8-fallback.css` 改回 `column`，否�?Tab 在底�?|
| 其它 EP 不兼容规�?| 待观�?| 再出现布局颠倒时优先�?`a8-fallback` |

### 9.3 仍存在的 UI / 视觉差异

**P1 �?资源与图�?*

| 区域 | 说明 |
|------|------|
| `am-icon` / `iconfont-base` | **已对�?*：`fontawesome-webfont.woff2` + `a8-am-icon.css`（FA 4.7）；未映射类仍走 `a8-icon-fallback` |
| IM 角标 | 缺图时用蓝底「IM」字（`app.css`�?|
| `/esport2/assets/*` | Vite 代理 `/esport2` �?3456；生产需同源静态目�?|

**P2 �?Vue 独有或与 A8 不同**

| 区域 | 说明 |
|------|------|
| 主列表无赛事 | 已对齐空列表（仅保留错误提示条） |
| 操盘 Tab | 「暂无在线用户」提示；A8 �?|
| 钱包刷新 | TronGrid �?TRX/USDT | 已对�?| `UserDiagWalletTab.refreshBalances` |
| 钱包地址生成 | A8 �?TronWeb | 已对�?| `tronWallet.generateTronWallet()` |
| 谷歌验证�?| 复刻为动�?TOTP + 可添加；A8 为静态空码（**增强**，非缺口除非要像素级空码�?|

**P3 �?建议同屏 pixel diff**

账号编辑、充提弹窗、初赔数据表现、版本角标逻辑、少�?`scoped` 样式（`HomeView` / `UserDiagTradeTab` / `LoginView`）�?
### 9.4 勿误判为缺口（与 A8 相同�?
- `Select` / `Pick a month` / `Select date and time`：bundle 原文即英文�?- 补单删除、账号注销：`MessageBox.confirm` �?A8 一致�?- 侧栏统计三列 + 延迟按钮配色：与 `UserInfoView` 一致�?
### 9.5 建议下一步（�?UI�?
1. 走查 changmen `/` �?11 个用户中�?Tab + 主界面关键路径（对照 `A8/.../index.js`）�?2. 同屏 pixel diff：账号编辑、充提弹窗、版本角标�?3. 钱包地址一致：接入 TronWeb 生成（行为改动，影响钱包 Tab 展示）�?