# client/web �?脱离 ui_bundle 迁移对照

新控制台源码：`client/web/`  
生产访问：`http://localhost:3456/`（需�?`npm run app:build`�?
> **已下�?*：旧 bundle 路径 `/console/`（`PATCH_CONSOLE=1`）与目录 `client/web/console/` 不再作为入口；backend �?`/console/*` 返回 301 �?`/`�?
开发：`npm run app:dev` �?Vite（Win `http://localhost:5274/` / 其它 `:5174`�?
## 阶段进度

| 阶段 | 状�?| 说明 |
|------|------|------|
| 0 地基 | **完成** | 脚手架、全�?API、登录、比赛列表预览、`/` 托管 |
| 1 数据�?| **完成** | fo + Vg + OB/RAY 采集 + A8 主区 UI |
| 2 用户 | **完成** | USERCONFIG、CollectConfig 全平台、BetTarget、Setting 弹窗 |
| 3 账号 | **完成** | Io + AccountBar、充提登记、余额刷�?|
| 4 订单 | **完成** | OrderView + LoseOrder 补单队列 + 后端 GetOrderList |
| 5 下单 | **完成** | checkBetting/betting + OB/RAY provider + 自动投注循环 |
| 6 多平台采�?| **完成** | 11 平台采集器；HG 无赔率流，启用时轮询余额 |
| 7 下线 bundle | **完成** | 唯一入口 `/`；`/console/*` 301 重定�?|
| 8 消息推�?| **完成** | `messageStore`（Gi）：Telegram/报表/补单发布 + 采集错误通知 |
| 9 下单扩展 | **完成** | TF / IA 客户�?Provider |
| 10 多平台下�?| **完成** | IM / IMT / SABA / PB；Stake 插件占位 |
| 11 皇冠跟单 | **完成** | `hgProvider` + `hgFollowLoop` |
| 12 UI 复刻 | **基本完成** | A8 CSS + Font Awesome 图标；见下方文档 |
| 13 投注行为对齐 | **完成** | WinRate、初�?补单阈值、anyOdds、lastOdds、noSameProvider |
| 15 联调加固 | **完成** | PB lineId、IM gameId、SABA 会话、HG 跟单通知 |
| 平博信用�?v4 | **完成** | login + `game/play/Login` E2E：`npm run test:v4` |

## 文档与验�?
**对照基线**：控制台 `/` �?`A8/A8frontendscipts/2.0.1` 为准。索引见 [docs/README.md](./docs/README.md)�?
| 文档 | 用�?|
|------|------|
| [docs/README.md](./docs/README.md) | 文档索引、基线说明、已删过期文件列�?|
| [docs/A8_UI_PARITY_GAPS.md](./docs/A8_UI_PARITY_GAPS.md) | UI/行为缺口清单 |
| [docs/A8_NEXT_STEPS.md](./docs/A8_NEXT_STEPS.md) | 待办与验收命�?|
| [docs/A8_WALKTHROUGH_CHECKLIST.md](./docs/A8_WALKTHROUGH_CHECKLIST.md) | 同屏走查勾选表 |
| [docs/A8_REPLICATE_8_PLATFORMS.md](./docs/A8_REPLICATE_8_PLATFORMS.md) | OB/IM/TF/PB/RAY/IMT/STAKE/IA 采集与下注复刻清�?|
| [docs/A8_WALKTHROUGH_SCRIPT.md](./docs/A8_WALKTHROUGH_SCRIPT.md) | 同屏走查逐步操作（点哪里、看什�?API�?|
| [docs/CREDIT_PLATE.md](./docs/CREDIT_PLATE.md) | 平博 v4 信用�?|
| [docs/_A8_VS_CHANGMEN_AUDIT.json](./docs/_A8_VS_CHANGMEN_AUDIT.json) | 2.0.1 代码级缺口（只读审计�?|
| [docs/A8_PARITY_AUDIT_MACHINE.json](./docs/A8_PARITY_AUDIT_MACHINE.json) | 历史机器审计快照（audit:a8 已下线） |

```bash
cd changmen/client/web
npm run test       # vitest
npm run test:v4    # 平博 v4（backend 3456�?npm run build
```

## 平博信用盘（`/`�?
与主�?`Client_Login` 分离：v4 使用 **A8 账号 + `a123456`**。本�?dev 默认 **`/v4.0/`** 代理�?`server/backend`�?
详细说明：[docs/CREDIT_PLATE.md](./docs/CREDIT_PLATE.md)

## A8 bundle 模块 �?新代码目�?
| A8 (minified) | 新路�?| 说明 |
|---------------|--------|------|
| `fo` | `src/stores/oddsStore.ts` | 实时赔率缓存 |
| `Vg` | `src/stores/matchStore.ts` | 比赛树、BetTarget、初�?10min 轮询 |
| `Xn` | `src/stores/userStore.ts` | 登录、用户配置、BetTarget setting |
| `Io` | `src/stores/accountStore.ts` | 多平台账�?|
| `Io` (orders) | `src/stores/orderStore.ts` | 订单列表、Link 分组、今日盈�?|
| `Tf` | `src/stores/collectStore.ts` | CollectConfig |
| `jb` | `src/stores/loseOrderStore.ts` | 补单队列 |
| `vf` / `vYe` / `bYe` | `src/providers/` | OB/RAY 下单 provider |
| `wYe` / `EYe` | `tfProvider` / `iaProvider` | TF/IA 下单 |
| `AZe` �?`nJe` | im / imt / saba / pb / stake | 多平台下�?|
| `qZe` / `SQ` | `hgProvider` / `hg/followLoop.ts` | 皇冠跟单 |
| 自动投注循环 | `src/stores/bettingStore.ts` | WinRate、anyOdds、补单阈值等 |
| `Gi` | `src/stores/messageStore.ts` | 推�?Telegram |
| `NMe` �?`PQ` | `client/venue-adapter/*/*/` | 各平台采�?|
| `SQ` | `hg/index.ts` + `hg/followLoop.ts` | HG 余额轮询 + 跟单（非 saveMatch�?|
| `LoginView` | `src/views/LoginView.vue` | |
| `HomeView` | `src/views/HomeView.vue` | |
| `ExtensionsView` | `src/components/layout/ExtensionsBadge.vue` | 版本角标 |
| `UserInfoView` | `UserInfoPanel.vue` | |
| `AccountView` | `AccountBar.vue` + `AccountCard.vue` | |
| `OrderView` / `LoseOrderView` | `order/*.vue` | |
| `Vt` / `_r` | `src/api/esport.ts` | Client_* / API_* |
| UserCollectView 平博 | `src/api/v4.ts` + `CollectConfigPanel.vue` | `enterCreditPlate` |

样式：`src/styles/a8.css`（extract）、`a8-am-icon.css`、`a8-fallback.css`、`app.css`、`user-diag.css`

## API 封装（阶�?0 已覆�?router.js 全部 action�?
�?`client/web/src/api/esport.ts`�?
## 对照测试

- 默认：backend 同源�?Vite dev（端口见 [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md)�?- Feed 调试：`http://localhost:3456/feed/`

**行为不一致时**：以 `A8/A8frontendscipts/2.0.1/index.js` 为准 grep �?port�? 
同屏走查�?[A8_WALKTHROUGH_CHECKLIST.md](./docs/A8_WALKTHROUGH_CHECKLIST.md)�?