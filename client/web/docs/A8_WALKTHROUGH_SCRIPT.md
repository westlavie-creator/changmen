# A8 走查操作脚本

配合 [A8_WALKTHROUGH_CHECKLIST.md](./A8_WALKTHROUGH_CHECKLIST.md) 使用：本文件写清**点哪里、看什么、Network 过滤什么**。  
changmen 唯一入口 **`/`**（dev：Win `5274` / 其它 `5174`；联调：backend 同源 `3560` / `3456`）。对照 A8 行为见 `A8/A8frontendscipts/2.0.1/index.js`。

建议账号：**TJ01**（与 `changmen/TJ01.JSON`、平博 v4 测试一致）。

---

## 0. 环境准备（约 5 分钟）

### 0.1 启动服务

```bash
# 终端 1：后端
cd changmen/server/backend
node server.js
# 确认 http://localhost:3456 可访问

# 终端 2：前端（dev）
cd changmen/client/web
npm run app:dev
# → http://localhost:5274/（Win）或 :5174

# 或联调：BAT\dev.bat 后访问 backend 同源 http://localhost:3560/（Win）或 :3456/
```

### 0.2 浏览器准备

1. Chrome 安装 **Gamebet 扩展**（`chrome-extension`，ID 见 `src/config/gamebetExtension.ts`）。
2. 两个窗口各开 DevTools → **Network**，勾选 **Preserve log**。
3. Filter 填：`Client_` 或 `/esport/`（后端 action 多为 `POST /esport/Client_XXX`）。

### 0.3 自动化预检（可选）

```bash
cd changmen/client/web
npm run test
npm run test:v4    # 需 3456
npm run build
```

---

## 1. 登录（约 3 分钟）

| 步骤 | 操作 | 两侧应一致 | Network |
|------|------|------------|---------|
| 1.1 | 打开登录页 | 背景图、`slogo`、`loginbox`、表单项 | — |
| 1.2 | 故意输错密码 | `.login-error` 红字提示 | `Client_Login` → `success !== 1` |
| 1.3 | TJ01 + 正确密码登录 | 进入主界面，无多余「登录」标题 | `Client_Login` → `success: 1` |
| 1.4 | 刷新页面（F5） | 仍保持登录（token） | `Client_GetUserInfo` |

**记录栏**（走查表底部）：登录布局 □ 通过 · 备注：________

---

## 2. 主界面布局（约 10 分钟）

### 2.1 骨架

| 步骤 | 操作 | 预期 |
|------|------|------|
| 2.1 | 看整体 | 左 **260px** 侧栏 + 顶栏（账号条 + 版本角标）+ 主区比赛列表 |
| 2.2 | 侧栏用户区 | 用户名、统计三列、延迟按钮颜色与旧版一致 |
| 2.3 | 侧栏订单区 | 日期筛选、平台下拉、刷新、表格列 |
| 2.4 | 侧栏补单区 | 补单列表 + 创建补单入口 |

### 2.2 版本角标（ExtensionsView）

| 步骤 | 操作 | 预期 |
|------|------|------|
| 2.5 | 看右上角版本数字 | class `version`，显示扩展版本或 `2.0.229` |
| 2.6 | 若本地 `/esport2/version.json` 与当前版本不同 | 仅扩展版不一致时出现 class `new`；hover 有「最新版本」 |
| 2.7 | 点击（有更新时） | 打开 `/esport2/extensions/{version}.zip` 或同源路径 |

### 2.3 账号横条（AccountView）

| 步骤 | 操作 | 预期 | Network |
|------|------|------|---------|
| 2.8 | 看账号卡 | 平台图标（OB 有图；IM 为 `/esport2/assets/Dv2UbQNP.png`，缺图则裂图） | — |
| 2.9 | 点刷新余额（单卡） | loading → 余额更新或错误文案 | 场馆 HTTP + `Client_UpdateBalance` |
| 2.10 | 点编辑 | 打开账号编辑大弹窗 | `Client_GetTagPlatforms` 等 |

### 2.4 比赛列表

| 步骤 | 操作 | 预期 | Network |
|------|------|------|---------|
| 2.11 | 有赛事时 | `.match` 卡片、BetRow、初赔行 | `Client_GetMatchs` 约 **30s** 一次 |
| 2.12 | 无赛事时 | **空白主区**，无「加载中」条、无红色 `app-hint` | — |
| 2.13 | BetRow 初赔 | 显示 `0.000` 或三位小数 | 登录 **≥10min** 后应有 `Client_GetMatchDefaultOdds` |
| 2.14 | 双击盘口行 | `prompt` 输入金额（手动下单） | 视配置可能触发投注相关请求 |

### 2.5 弹窗抽样

| 步骤 | 操作 | 预期 |
|------|------|------|
| 2.15 | 触发限红 | `LimitDiag` 弹窗样式 |
| 2.16 | 创建补单 | `CreateLose` 弹窗字段与旧版一致 |

**记录栏**：主界面 □ · 版本角标 □ · 账号条 □ · 比赛列表 □

---

## 3. 用户中心 11 Tab（约 25 分钟）

打开方式：侧栏用户区 → 设置/用户按钮 → `UserDiag` 弹窗（宽 **880**，无右上角 X，靠底部关闭）。

对每个 Tab：**先旧版点一遍 → 新版同样操作 → 勾 checklist**。

### 3.1 排行榜

- 看：表格列、标签、`el-button-group` 操作按钮。
- Network：`Client_GetUserProfit`（及合并 phb 逻辑，与旧版返回结构一致即可）。

### 3.2 修改密码

- 看：表单字段布局。
- **已知差异**：新版为 **TOTP 动态码**；旧版验证码区多为占位。若产品要求像素一致再单独开任务。
- Network：保存时 `Client_*` 密码相关 action（按实现）。

### 3.3 消息通知

- 看：`el-form` 各开关/输入。
- 保存后 Network：`Client_SaveData` / `Client_UpdateSetting`（key 与旧版一致）。

### 3.4 代理配置

- 看：`el-input` prepend 标签、列表增删。
- Network：`Client_GetData` / `Client_SaveData`（Proxy）。

### 3.5 报表查询

- 看：月份选择、`el-table`、summary 行。
- Network：`Client_MonthReport`。

### 3.6 赛事采集（重点）

按 [A8_COLLECT_VIEW_PIXEL_PARITY.md](./A8_COLLECT_VIEW_PIXEL_PARITY.md)：

| 步骤 | 操作 | 预期 |
|------|------|------|
| 3.6.1 | 进入 Tab | 所有 `el-switch` **灰色禁用** |
| 3.6.2 | 单击开关 | 仍无法切换 |
| 3.6.3 | **双击** 信用盘行「**盘**」字 | 开关全部解锁 |
| 3.6.4 | 关闭某平台开关 | Network **不应**再出现该平台 `API_SaveMatch` / `API_SaveBet`（OB 轮询可仍在，但不上报） |
| 3.6.5 | 点平博/OB/SABA 信用盘 | 跳转 v4 或对应信用盘流程 |

### 3.7 操盘（需 BetTarget）

| 步骤 | 操作 | 预期 |
|------|------|------|
| 3.7.1 | Tab 是否显示 | 用户开启 BetTarget 后才出现 |
| 3.7.2 | 在线用户列表 | GoEasy 连接后显示用户；**两侧均无**「暂无在线用户」文案（新版已去掉） |
| 3.7.3 | Network | `Client_GetUsers`、`Client_GetPlayerOrder` 等 |

### 3.8 跟单

- 看：`el-checkbox-group`、HG 相关字段。
- 保存：`Client_SaveData` / setting。

### 3.9 聊天室

- 看：`top` / `log` / `filter` / `tags` 布局。
- Network：`Client_GetChatHistory`、`Client_SaveUserLog`。

### 3.10 钱包（本轮重点）

| 步骤 | 操作 | 预期 | Network |
|------|------|------|---------|
| 3.10.1 | 创建钱包 | 地址以 **T** 开头、34 位左右（TronWeb） | `Client_SaveData` key=`Wallet` |
| 3.10.2 | 复制私钥 | toast「私钥已复制」 | — |
| 3.10.3 | 刷新余额 | TRX/USDT 数字变化（需 TronGrid 可达） | 链上请求（非 Client_*） |
| 3.10.4 | 有余额时删除 | 应拦截「账户内还存在余额」 | — |

**记录栏**：11 Tab 各 □ 一项

---

## 4. 账号与资金（约 15 分钟）

### 4.1 账号编辑 `AccountEditDialog`

| 步骤 | 操作 | 预期 |
|------|------|------|
| 4.1 | 粘贴导入区 | 解析多行账号 |
| 4.2 | 游戏 fieldset | 点击展开/折叠 |
| 4.3 | PB 比例 | legend「投」**双击**切换锁定 |
| 4.4 | 保存 | 侧栏出现/更新账号卡 |

### 4.2 充提

| 步骤 | 操作 | Network |
|------|------|---------|
| 4.5 | 充提登记弹窗 | 表单字段、`Client_SaveMoneyLog` |
| 4.6 | 充提流水弹窗 | 表格 + `MoneyRiskView` 标签、`Client_GetMoneyLogs` / `Client_GetPlayerOrder` |

### 4.3 参数配置 `UserConfigDialog`

| 步骤 | 操作 | 预期 |
|------|------|------|
| 4.7 | 打开参数配置 | fieldset 分组与旧版一致 |
| 4.8 | 改「禁止同盘」/「胜率优先」等 | 保存成功 |
| 4.9 | 平台排序拖拽 | `providerSortValue` 顺序保留 |
| 4.10 | 保存 | `Client_SaveData` USERCONFIG |

---

## 5. 行为与 Network 清单（约 20 分钟，需测试账号）

在**仅新版**或两侧同时开启自动投注时观察。

### 5.1 周期性请求（DevTools 过滤 `Client_`）

| 接口 | 间隔 | 含义 |
|------|------|------|
| `Client_GetMatchs` | ~30s | 比赛树刷新 |
| `Client_GetMatchDefaultOdds` | ~10min | 初赔批量拉取 |
| `Client_GetOrderList` | 手动/刷新 | 侧栏订单 |

### 5.2 自动投注（开启后）

| 检查项 | 如何验证 |
|--------|----------|
| 主循环 | 有可用盘口时出现下单尝试（日志或订单） |
| WinRate | 配置「胜率优先」+ `winRateValue`，观察两腿平台顺序是否按胜率重排 |
| anyOdds | 一侧被拒后是否换平台重试（最多约 3 轮） |
| lastOdds | 同盘更低赔不再重复下 |
| 补单阈值 | `makeUp_defaultOdds` 设得很低时不应创建补单 |
| saveOrders | 刷新某账号余额后，Network 按 **provider 分组** 多次 `Client_SaveOrder` |

### 5.3 平台专项

| 平台 | 检查 |
|------|------|
| **Stake** | Chrome + 扩展；打开 stake.com；采集/下注前 tabId 就绪（新版登录后 `primeStakeTabId`） |
| **HG** | 无列表赔率；开启 HG 采集开关 → 约 60s `Client_UpdateBalance`；跟单见 `hgFollowLoop` |
| **IA** | 仅配 Gateway 也可尝试采集（Token 可空） |
| **XBet** | 仅有 Socket 比分/赔率频道，**无下注账号类型** |
| **平博 v4** | `npm run test:v4` 或赛事采集 → 信用盘 → login + `game/play/Login` |

### 5.4 OB 模式 P（A8 Parity）

前置：`BAT\dev.bat parity` 或 `BAT\dev.bat` + matcher；登录 TJ01。

| 步骤 | 操作 | 预期 |
|------|------|------|
| 5.4.1 | 用户中心 → 赛事采集 → 双击「盘」解锁 | 开关可点 |
| 5.4.2 | 开启 OB 回传 | ~30s 内 Network：`API_SaveMatch?OB`、`API_SaveBet?OB` |
| 5.4.3 | 关闭 OB 回传 | 无上述 API；BetRow 赔率仍随 MQTT/fo 变化 |
| 5.4.4 | DevTools → Network → WS | OB MQTT 直连源站 `wss://…`（不经本机 relay） |
| 5.4.5 | 账号编辑粘贴 OB Base64 账号 | `ACCOUNT` 写入 |
| 5.4.6 | 双击 BetRow（OB 列） | 验盘 + 下单 prompt / 成功（需有效 token） |

离线：`cd client/web && npm run test:ob`。  
Live 只读（后端 3456）：`ESPORT_TEST_BASE=http://127.0.0.1:3456 npm run test:ob-live`。  
计划全文：[A8_OB_REPLICATE_PLAN.md](./A8_OB_REPLICATE_PLAN.md)。

---

## 6. 差异记录模板

走查结束复制下表到 checklist「记录」节或 issue：

| # | 页面 | 旧版表现 | 新版表现 | 严重度 | 是否阻塞上线 |
|---|------|----------|----------|--------|--------------|
| 1 | | | | P0/P1/P2/P3 | 是/否 |
| 2 | | | | | |

**严重度建议**

- **P0**：功能不可用（登录、下单、丢单）
- **P1**：行为与 bundle 不一致且影响操盘
- **P2**：UI 明显错位/缺图
- **P3**：文案、增强功能（如 TOTP）

---

## 7. 当前「勿报 bug」项（2026-05-29 代码状态）

与 [A8_UI_PARITY_GAPS.md](./A8_UI_PARITY_GAPS.md) 同步，走查时**不要**当回归：

| 项 | 说明 |
|----|------|
| HG 无电竞赔率列表 | 与 A8 / `hg_feed` 一致 |
| XBet 不可下注 | bundle 无 Provider |
| Select / Pick a month | Element Plus 英文 placeholder，旧版亦然 |
| 修改密码 TOTP | 新版增强，非 bug |
| `Dv2UbQNP.png` 缺失 | 运维补静态资源，非前端逻辑 |

**已修复、若仍出现请报 bug**：主列表红色错误条、操盘「暂无在线用户」、钱包假地址、IM 蓝底占位字、`getOrderOptions` 缺账号 profit、`saveOrders` 未调用等。

---

## 8. 走查完成后

1. 勾选 [A8_WALKTHROUGH_CHECKLIST.md](./A8_WALKTHROUGH_CHECKLIST.md) 各表。
2. 把 P0/P1 项开 issue 或当场修。
3. 更新 `A8_UI_PARITY_GAPS.md` / `A8_NEXT_STEPS.md` 中过时描述。
4. 稳定后分批 commit（不含 `data/esport/*.json`）。
