# A8 UI / 行为复刻缺口清单

对照基线：`changmen/gamebet_frontend/vendor/ui-bundle/index.js`（与 `/console/` 同源）。  
本清单只列**尚未对齐**或**仅部分对齐**项；数据层/采集/下单见 `MIGRATION.md` 与各 `collectors/docs/*`。

最后更新：UI 阶段 3–4（登录、用户信息、参数配置、用户中心全 Tab、赛事采集 span 修正）。

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
| 账号横条 | `AccountView` (`bDe`) | **UI** | `AccountCard` 用自定义 `acct-btn`/`.tag`，非 `el-button` + `el-tag` + `el-progress` + `el-tooltip` |
| 版本角标 | `ExtensionsView` (`GHe`) | 基本对齐 | class `version`/`new`；扩展版本来源略有不同 |
| 侧栏用户区 | `UserInfoView` | 已对齐 | 阶段 1–2 |
| 侧栏订单 | `OrderView` | **UI** | 日期/账号筛选用原生 `input`/`select`，A8 为 `el-date-picker` + `el-select` |
| 侧栏补单 | `LoseOrderView` | 待核对 | 需与 bundle 逐 class 对照 |
| 限红弹窗 | `LimitDiagView` | **UI** | 仍用 `AppDialog`，A8 为 `el-dialog` |
| 创建补单 | `CreateLoseView` | **UI** | 仍用 `AppDialog` |
| 初赔行 | `defaultOdds` | **数据** | 前端 DOM 已有；`Client_GetMatchDefaultOdds` 仍返回 `{}` |
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
| 操盘 | `TradeView` | **暂缓** | A8 为插件 WebSocket 远程操盘；本仓库为本地账号字段编辑 |
| 跟单 | `FollowView` | 已对齐 | `el-form` / checkbox-group |
| 聊天室 | `UserChatMessageView` | 已对齐 | `top`/`log`/`filter`/`tags` 布局 |
| 钱包 | `UserWalletView` | 已对齐 | `wallets` + `el-input` prepend |

---

## 四、账号与资金（AccountView 生态）

| 项 | bundle | 状态 | 说明 |
|----|--------|------|------|
| 充提登记 | `MoneyView` (`fDe`) | **UI** | `MoneyInfoDialog` 存在，表单项/对话框样式待与 `MoneyInfoView` 细对 |
| 风险标签 | `MoneyRiskView` | **缺失** | 充提流程内「风险标签」fieldset，依赖 `getPlayerOrders` |
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
| `betSorting: WinRate` | 有 | **行为** | `ViewBet.getOrderOptions` 无 `WinRate` 分支 |
| `anyOdds` 被拒重试 | 有 | **行为** | `bettingStore` / `accountStore.betting` 未实现 |
| `makeUp_defaultOdds` / `makeUp_odds` | 有 | **行为** | 配置可存，补单逻辑未读初赔/当前赔阈值 |
| `allowSameBet` / `noSameBet` | 有 | 部分 | 使用 `noSameBet` + sessionStorage；命名与 bundle 略有差异 |
| `noSameProvider` | 有 | 部分 | 补单路径有；主循环需再核对 |
| 定时开启投注 | 有 | 已对齐 | `bettingStore.tickAutoOpen` |
| HG 采集 | `SQ` | 占位 | 无赔率流，仅占位 |
| Stake 下单 | 插件 | **暂缓** | `stakeProvider` 占位 |

---

## 七、建议优先级（仍做 UI 复刻时）

1. **P0 UI**：`AccountCard` → `el-button`/`el-tag`/`el-progress`；`OrderView` → Element 日期/选择器；限红/补单弹窗 → `el-dialog`
2. **P1 UI**：`MoneyInfoDialog` + 可选 `MoneyRiskView` 子面板
3. **P1 数据**：实现 `Client_GetMatchDefaultOdds` 或等价接口，初赔行才有内容
4. **P2 行为**（用户曾暂缓）：`WinRate`、`anyOdds`、补单赔率阈值
5. **P3**：远程 `TradeView`（依赖浏览器插件协议）

---

## 八、验收方式

```bash
cd changmen/gamebet_frontend
npm run app:dev
# 新：http://localhost:5174/app/
# 旧：http://localhost:3456/console/  （需 PATCH_CONSOLE=1 + 后端 3456）
```

同屏对比：登录页、侧栏用户区、用户中心各 Tab、顶栏账号卡、赛事列表 BetRow、订单区。
