# A8 同屏走查清单（`/console/` vs `/`）

开发地址：`http://localhost:5174/`  
对照地址：`http://localhost:3456/console/`（`PATCH_CONSOLE=1` + backend `3456`）

登录建议：**TJ01** / 配置密码（与 `a8_constants.js` 一致），便于平博 v4 与初赔数据一致。

**逐步操作说明**（点哪里、看什么 Network）：[A8_WALKTHROUGH_SCRIPT.md](./A8_WALKTHROUGH_SCRIPT.md)

---

## 0. 启动

- [ ] `BAT\dev.bat` 或 `BAT\dev.bat`（3560 后端 + 5174 Vite）+ 可选 `npm run matcher:loop`
- [ ] 可选：`PATCH_CONSOLE=1` 启动以打开 `/console/` 对照

自动化（无需浏览器）：

```bash
cd changmen/client/web
npm run audit:a8    # CSS / View 映射
npm run test:v4     # 平博 v4 两步（需 3456）
npm run build
```

---

## 1. 登录

| 项 | 通过 |
|----|------|
| 背景图、`slogo`、`loginbox` 布局 | |
| 无多余「登录」标题 | |
| 错误提示样式（`.login-error`） | |
| 登录后进主界面，侧栏用户信息 | |

---

## 2. 主界面

| 项 | 通过 |
|----|------|
| 左 260px 侧栏 + 顶栏账号条 + 版本角标 | |
| 版本角标：显示扩展版本；有更新时 `.new` + 可下载 zip | |
| 账号卡：平台图标、工具条 Font Awesome 图标 | |
| 比赛列表：无赛时空白（无「加载中」条） | |
| BetRow：初赔行 `0.000` 或数值；双击手动下单 prompt | |
| 限红弹窗、创建补单弹窗 | |

---

## 3. 用户中心（11 Tab）

对每个 Tab 勾选「结构/字段/按钮与旧版一致」：

| Tab | 通过 |
|-----|------|
| 排行榜 | |
| 修改密码（TOTP 为增强，可接受差异） | |
| 消息通知 | |
| 代理配置 | |
| 报表查询 | |
| 赛事采集（开关双击「盘」解锁；平博/OB/SABA 信用盘） | |
| 操盘（GoEasy 在线用户） | |
| 跟单 | |
| 聊天室 | |
| 钱包 | |

---

## 4. 账号与资金

| 项 | 通过 |
|----|------|
| 账号编辑：粘贴导入、游戏 fieldset 展开、比例锁定双击「投」 | |
| 充提登记 `MoneyInfoDialog` | |
| 充提流水 `MoneyLogDialog` + 风险标签 | |
| 参数配置 `UserConfigDialog` 保存 | |

---

## 5. 行为（可选，需实盘或测试账号）

| 项 | 通过 |
|----|------|
| 开启自动投注后主循环跑起来 | |
| Network：`Client_GetMatchs` ~30s | |
| Network：`Client_GetMatchDefaultOdds` ~10min | |
| WinRate 排序、补单阈值、anyOdds 重试 | |
| 平博体育：v4 login + game/play/Login + 确认弹窗 | |

---

## 6. 已知可接受差异

- 修改密码：新版为 TOTP（旧版验证码区多为占位）
- HG：**无电竞赔率列表**；启用采集开关时会轮询 HG 账号余额（见 `client/platform-adapter/hg/frontend/collect.ts`）
- XBet：仅采集/比分，不可下注（与 bundle 一致）
- Stake：依赖 Chrome 扩展 + stake.com 标签页（见走查脚本 §5.3）
- IM 角标图 `Dv2UbQNP.png`：需部署到 `/esport2/assets/`（与 console 同源）

---

## 6.1 已对齐项（走查若仍出现请当回归）

- 主列表无红色 `app-hint` 错误条
- 操盘 Tab 无「暂无在线用户」
- 钱包：TronWeb 创建地址 + 刷新链上余额
- 自动投注：`allowSameBet`、账号级 `profit`、`Client_SaveOrder` 分组 `saveOrders`

---

## 7. OB 模式 P（A8 Parity，可选）

启动：`BAT\dev.bat parity` 或 `BAT\dev.bat` + `npm run matcher:loop` + 插件 build。

| 项 | 通过 |
|----|------|
| 用户中心双击「盘」解锁 → 开启 OB 回传 | |
| Network：`API_SaveMatch?OB` + `API_SaveBet?OB`（约 30s 周期） | |
| 关 OB 开关后无 SaveMatch/SaveBet，BetRow 赔率仍变 | |
| WS：浏览器直连 OB MQTT（`wss://…`，非本机 `/esport/ws/OB`） | |
| `npm run test:ob`（app 目录）离线 PASS | |
| `ESPORT_TEST_BASE=http://127.0.0.1:3456 npm run test:ob-live` 只读 PASS | |
| 粘贴 OB 账号 → 双击 BetRow 下单（需有效 token） | |

逐步操作：[A8_WALKTHROUGH_SCRIPT.md](./A8_WALKTHROUGH_SCRIPT.md) §5.4

---

## 记录

| 日期 | 走查人 | 备注 |
|------|--------|------|
| | | |
