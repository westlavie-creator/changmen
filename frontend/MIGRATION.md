# 脱离 ui_bundle 迁移对照

新控制台源码：`frontend/app/`  
旧控制台（bundle）：`frontend/console/` → `/console/`  
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
| 6 多平台采集 | **完成** | 全部 11 平台采集器已接入（HG 无赔率流，仅占位） |
| 7 下线 bundle | **完成** | 默认入口 `/app/`；`preweb` 构建 Vue；旧 `/console/` 需 `PATCH_CONSOLE=1` |
| 8 消息推送 | **完成** | `messageStore`（Gi）：Telegram/报表/补单发布 + 采集错误通知 |
| 9 下单扩展 | **完成** | TF / IA 客户端 Provider（checkBet + betting + 余额） |
| 10 多平台下单 | **完成** | IM / IMT / SABA / PB 完整 Provider；Stake 插件占位 |
| 11 皇冠跟单 | **完成** | `hgProvider` + `hgFollowLoop`（SQ）；common API 代理跟单队列 |

## A8 bundle 模块 → 新代码目录

| A8 (minified) | 新路径 | 说明 |
|---------------|--------|------|
| `fo` | `src/stores/oddsStore.ts` | 实时赔率缓存 |
| `Vg` | `src/stores/matchStore.ts` | 比赛树、BetTarget |
| `Xn` | `src/stores/userStore.ts` | 登录、用户配置、BetTarget setting |
| `Io` | `src/stores/accountStore.ts` | 多平台账号 |
| `Io` (orders) | `src/stores/orderStore.ts` | 订单列表、Link 分组、今日盈亏 |
| `Tf` | `src/stores/collectStore.ts` | CollectConfig |
| `jb` | `src/stores/loseOrderStore.ts` | 补单队列 |
| `vf` / `vYe` / `bYe` | `src/providers/` | OB/RAY 下单 provider |
| `wYe` / `EYe` | `src/providers/tfProvider.ts` / `iaProvider.ts` | TF/IA 下单 |
| `AZe` / `BZe` / `SZe` / `kZe` / `nJe` | `imProvider` / `imtProvider` / `sabaProvider` / `pbProvider` / `stakeProvider` | 阶段 10 |
| `qZe` / `SQ` | `hgProvider` / `hgFollowLoop.ts` | 阶段 11 皇冠跟单 |
| 自动投注循环 | `src/stores/bettingStore.ts` | 对齐 A8 Vg 主循环 |
| `Gi` | `src/stores/messageStore.ts` | 推送/Telegram |
| `NMe` | `src/collectors/ob.ts` | OB MQTT + HTTP |
| `bQe` | `src/collectors/ray.ts` | RAY SC + HTTP |
| `NBe` | `src/collectors/tf.ts` | TF WS + HTTP |
| `CQe` | `src/collectors/ia.ts` | IA Socket.IO + HTTP |
| `U2` | `src/collectors/saba.ts` | SABA 页面解析 + Socket.IO |
| `EZe` | `src/collectors/im.ts` | IM A8 聚合 Socket |
| `KQe` | `src/collectors/xbet.ts` | XBet A8 聚合 Socket |
| `PQ` | `src/collectors/stake.ts` | Stake GraphQL + A8 Socket |
| `SQ` | `src/services/hgFollowLoop.ts` | HG 跟单循环（非 saveMatch 采集） |
| `LoginView` | `src/views/LoginView.vue` | |
| `HomeView` | `src/views/HomeView.vue` | |
| `UserInfoView` | `src/components/user/UserInfoPanel.vue` | 用户信息 / BetTarget |
| `AccountView` | `src/components/account/AccountBar.vue` | 多平台账号横条 |
| `OrderView` | `src/components/order/OrderView.vue` | 侧栏订单列表 |
| `LoseOrderView` | `src/components/order/LoseOrderView.vue` | 补单队列 |
| `Vt` / `_r` | `src/api/esport.ts` | Client_* / API_* |

## API 封装（阶段 0 已覆盖 router.js 全部 action）

见 `frontend/app/src/api/esport.ts`。

## 双轨对照测试

- 新（默认）：`http://localhost:3456/app/` 或 dev `http://localhost:5174/app/`
- Feed 调试：`http://localhost:3456/feed/`
- 旧 bundle：`http://localhost:3456/console/`（需 `PATCH_CONSOLE=1 npm run web` 或 `npm run patch:ui`）

行为不一致时，以 `frontend/vendor/ui-bundle/index.js` 为准 grep 后 port。
