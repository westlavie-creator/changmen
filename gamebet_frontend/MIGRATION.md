# 脱离 ui_bundle 迁移对照

新控制台源码：`gamebet_frontend/app/`
旧控制台（bundle）：`gamebet_frontend/console/` → `/console/`
生产访问：`http://localhost:3456/app/`（需先 `npm run app:build`）

开发：`npm run app:dev` → `http://localhost:5174/app/`

## 阶段进度

| 阶段 | 状态 | 说明 |
|------|------|------|
| 0 地基 | **完成** | 脚手架、全量 API、登录、比赛列表预览、`/app/` 托管 |
| 1 数据层 | **完成** | fo + Vg + OB/RAY 采集 + A8 主区 UI |
| 2 用户 | **完成** | USERCONFIG、CollectConfig 全平台、BetTarget、Setting 弹窗 |
| 3 账号 | **完成** | Io + AccountBar、充提登记、余额刷新 |
| 4 订单 | **完成** | OrderView + LoseOrder 补单队列 + 后端 GetOrderList |
| 5 下单 | **完成** | checkBetting/betting + OB/RAY provider + 自动投注循环 |
| 6 多平台采集 | **完成** | 11 平台采集器；HG 无赔率流，启用时轮询余额 |
| 7 下线 bundle | **完成** | 默认入口 `/app/`；`preweb` 构建 Vue；旧 `/console/` 需 `PATCH_CONSOLE=1` |
| 8 消息推送 | **完成** | `messageStore`（Gi）：Telegram/报表/补单发布 + 采集错误通知 |
| 9 下单扩展 | **完成** | TF / IA 客户端 Provider |
| 10 多平台下单 | **完成** | IM / IMT / SABA / PB；Stake 插件占位 |
| 11 皇冠跟单 | **完成** | `hgProvider` + `hgFollowLoop` |
| 12 UI 复刻 | **基本完成** | A8 CSS + Font Awesome 图标；见下方文档 |
| 13 投注行为对齐 | **完成** | WinRate、初赔/补单阈值、anyOdds、lastOdds、noSameProvider |
| 15 联调加固 | **完成** | PB lineId、IM gameId、SABA 会话、HG 跟单通知 |
| 平博信用盘 v4 | **完成** | login + `game/play/Login` E2E：`npm run test:v4` |

## 文档与验收

**对照基线**：新控制台 `/app/` 以 `A8/A8frontendscipts/2.0.1` 为准；旧 `/console/` 仍以 `vendor/ui-bundle` 双轨对照。索引见 [app/docs/README.md](./app/docs/README.md)。

| 文档 | 用途 |
|------|------|
| [app/docs/README.md](./app/docs/README.md) | 文档索引、基线说明、已删过期文件列表 |
| [app/docs/A8_UI_PARITY_GAPS.md](./app/docs/A8_UI_PARITY_GAPS.md) | UI/行为缺口清单 |
| [app/docs/A8_NEXT_STEPS.md](./app/docs/A8_NEXT_STEPS.md) | 待办与验收命令 |
| [app/docs/A8_WALKTHROUGH_CHECKLIST.md](./app/docs/A8_WALKTHROUGH_CHECKLIST.md) | 同屏走查勾选表 |
| [app/docs/A8_REPLICATE_8_PLATFORMS.md](./app/docs/A8_REPLICATE_8_PLATFORMS.md) | OB/IM/TF/PB/RAY/IMT/STAKE/IA 采集与下注复刻清单 |
| [app/docs/A8_WALKTHROUGH_SCRIPT.md](./app/docs/A8_WALKTHROUGH_SCRIPT.md) | 同屏走查逐步操作（点哪里、看什么 API） |
| [app/docs/CREDIT_PLATE.md](./app/docs/CREDIT_PLATE.md) | 平博 v4 信用盘 |
| [app/docs/_A8_VS_CHANGMEN_AUDIT.json](./app/docs/_A8_VS_CHANGMEN_AUDIT.json) | 2.0.1 代码级缺口（只读审计） |
| [app/docs/A8_PARITY_AUDIT_MACHINE.json](./app/docs/A8_PARITY_AUDIT_MACHINE.json) | 机器审计（`npm run audit:a8`，View 源为 vendor bundle） |

```bash
cd changmen/gamebet_frontend/app
npm run audit:a8   # CSS 选择器与 bundle View 映射
npm run test:v4    # 平博 v4（backend 3456）
npm run build
```

## 平博信用盘（`/app/`）

与主站 `Client_Login` 分离：v4 使用 **A8 账号 + `a123456`**。本地 dev 默认 **`/v4.0/`** 代理到 gamebet_backend。

详细说明：[app/docs/CREDIT_PLATE.md](./app/docs/CREDIT_PLATE.md)

## A8 bundle 模块 → 新代码目录

| A8 (minified) | 新路径 | 说明 |
|---------------|--------|------|
| `fo` | `src/stores/oddsStore.ts` | 实时赔率缓存 |
| `Vg` | `src/stores/matchStore.ts` | 比赛树、BetTarget、初赔 10min 轮询 |
| `Xn` | `src/stores/userStore.ts` | 登录、用户配置、BetTarget setting |
| `Io` | `src/stores/accountStore.ts` | 多平台账号 |
| `Io` (orders) | `src/stores/orderStore.ts` | 订单列表、Link 分组、今日盈亏 |
| `Tf` | `src/stores/collectStore.ts` | CollectConfig |
| `jb` | `src/stores/loseOrderStore.ts` | 补单队列 |
| `vf` / `vYe` / `bYe` | `src/providers/` | OB/RAY 下单 provider |
| `wYe` / `EYe` | `tfProvider` / `iaProvider` | TF/IA 下单 |
| `AZe` … `nJe` | im / imt / saba / pb / stake | 多平台下单 |
| `qZe` / `SQ` | `hgProvider` / `hg/followLoop.ts` | 皇冠跟单 |
| 自动投注循环 | `src/stores/bettingStore.ts` | WinRate、anyOdds、补单阈值等 |
| `Gi` | `src/stores/messageStore.ts` | 推送/Telegram |
| `NMe` … `PQ` | `platform_adapter/*/frontend/*` | 各平台采集 |
| `SQ` | `hg/index.ts` + `hg/followLoop.ts` | HG 余额轮询 + 跟单（非 saveMatch） |
| `LoginView` | `src/views/LoginView.vue` | |
| `HomeView` | `src/views/HomeView.vue` | |
| `ExtensionsView` | `src/components/layout/ExtensionsBadge.vue` | 版本角标 |
| `UserInfoView` | `UserInfoPanel.vue` | |
| `AccountView` | `AccountBar.vue` + `AccountCard.vue` | |
| `OrderView` / `LoseOrderView` | `order/*.vue` | |
| `Vt` / `_r` | `src/api/esport.ts` | Client_* / API_* |
| UserCollectView 平博 | `src/api/v4.ts` + `CollectConfigPanel.vue` | `enterCreditPlate` |

样式：`src/styles/a8.css`（extract）、`a8-am-icon.css`、`a8-fallback.css`、`app.css`、`user-diag.css`

## API 封装（阶段 0 已覆盖 router.js 全部 action）

见 `gamebet_frontend/app/src/api/esport.ts`。

## 双轨对照测试

- 新（默认）：`http://localhost:3456/app/` 或 dev `http://localhost:5174/app/`
- Feed 调试：`http://localhost:3456/feed/`
- 旧 bundle：`http://localhost:3456/console/`（需 `PATCH_CONSOLE=1`）

**`/app/` 行为不一致时**：以 `A8/A8frontendscipts/2.0.1/index.js` 为准 grep 后 port。
**仅 `/console/` 双轨对照时**：可用 `vendor/ui-bundle/index.js`。
同屏走查用 [A8_WALKTHROUGH_CHECKLIST.md](./app/docs/A8_WALKTHROUGH_CHECKLIST.md)。
