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
| 7 下线 bundle | 待做 | 默认入口改为 /app/ |

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
| `SQ` | `src/collectors/hg.ts` | HG 占位（跟单非采集） |
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

- 旧：`http://localhost:3456/console/`
- 新：`http://localhost:3456/app/` 或 dev `http://localhost:5174/app/`

行为不一致时，以 `frontend/vendor/ui-bundle/index.js` 为准 grep 后 port。
