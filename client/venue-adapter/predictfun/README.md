# Predict.fun 场馆适配器



## 模式 A（已定：运营主号 / house）



全站 Predict.fun 套利 **共用运营者一个主号** 下单；changmen 用户 **无需** 在 predict.fun 开户。



| 角色 | 说明 |

|------|------|

| 运营主号 | 持有 USDT、PP、推荐奖励；JWT + EIP-712 签名下单 |

| changmen 用户 | `PlatformAccount.token` 仅占位 `{ "mode": "house" }`，用于玩家/订单归属 |

| 采集 | **VPS 单进程 HTTP** → RDS；浏览器 **仅 WS** → `fo` |



### 环境变量（运营主号 — **仅 VPS**）



生产写入 `server/backend/.env`（**不要**再用 `VITE_PREDICT_FUN_PRIVY_*` 打进前端）：



```env

PREDICT_FUN_API_BASE=https://api.predict.fun

PREDICT_FUN_API_KEY=<主网 API Key>

PREDICT_FUN_PRIVY_PRIVATE_KEY=<从 predict.fun/account/settings 导出>

PREDICT_FUN_PREDICT_ACCOUNT=<deposit address / Predict Account>

PF_HOUSE_MAX_STAKE_USDT=500

```



前端构建可保留 `VITE_PREDICT_FUN_API_KEY` 仅用于官方 WS 直连探测（可选）；生产推荐用户走 VPS 连接，Key 只放服务器。



### 用户账号 token



```json

{ "mode": "house" }

```



须已创建 changmen `playerId`（`Client_CreateTagPlatform` 等）。下单归属靠 `playerId`，不靠 PF 开户。



## 采集架构



| 层 | 职责 |

|----|------|

| `server/collectors/predictfun-collector`（PM2） | 直连 `api.predict.fun`：categories → orderbook → `writePlatformMatches` / `replacePlatformBetsForMatch`；写 `predictfun_market_index.json` |

| 浏览器 `collect.ts` | 经 `Client_GetCollectPlatform` 拉 `MarketIndex`；Market WS → `fo`（官方直连或 `ws-forward`） |

| `server/ws_forward` hub | 全站单条上游 WS，合并订阅后 fan-out |



### 用户连接（对齐 Polymarket）



| | 直连 `direct` / `official` | 经 VPS `vps` / `changmen` |

|--|--|--|

| HTTP | 浏览器 → `api.predict.fun` | `/esport/http-relay` → 官方 |

| Market WS | `wss://ws.predict.fun/ws` | `/esport/ws-forward/PREDICTFUN-MARKET` → **独立** `changmen-predictfun-market-hub`（`:3458`） |

| 切换 | 登录探测；角标点 `predictfun-market` | 手动后跳过下次自动路由至 logout |



- `localStorage.PF_HTTP_MODE` = `direct` \| `vps`

- `localStorage.changmen:pf:market-ws-source-mode` = `official` \| `changmen`

- 默认：官方 WS 可达 → HTTP direct + WS official；否则 HTTP vps + WS changmen



- REST 限流：**240 次/分钟/Key** — 由 VPS 单进程承担，避免每开页面重复打 discovery

- `fo` 条目含 `marketId`（下注 `checkBet` 预检用）

- 浏览器 **不再** 经 http-relay 跑 categories/orderbook discovery



本地 / 生产启动采集进程：



```bat

npm run predictfun-collector

```



PM2：`changmen-predictfun-collector`（见 `deploy/ecosystem.config.cjs`）。



## 用户开号（产品约定）

- **用户自己添加**：场馆选 PredictFun → 账号名自动=登录名，token 固定 `{ "mode": "house" }`，无需私钥
- **管理端**：`/admin/predictfun-members`（仅管理员）查看/开通 PF 会员、改额度；通用「子账号」页不管开号
- `accountId`/`playerId` 仍是 RDS `players.id`；下单走 VPS 主号代下

## 下注（VPS house 代下）

- 浏览器：`checkBet` → `Pf_CheckBet`；`betting` → `Pf_SubmitOrder`（changmen JWT + `playerId`）
- 确认：`getOrders` → `Pf_GetOrders`；`resolveLegOutcome`（仅 PF provider）轮询 `Pf_GetOrder`
  - 官方状态：`FILLED`→成交持仓；`CANCELLED`/`EXPIRED`/`INVALIDATED`→拒单并退还 `total_balance`；`OPEN`→继续等
  - **买单拒单/成交**：`Pf_GetOrder` 走 `fetchHousePredictOrderResolved`（REST + `predictWalletEvents` hint），与卖出确认同源加速
  - 手动下注：`betGateway` 在 `pending` 后后台 `settleArbLeg`（与 PM 同路径，仅多开 PredictFun）
  - **不改**共享 `resolveVenueLegOutcome` / `confirmPmPost`（PM 与其它场馆路径不变）
- 市场结算：`Market.status=RESOLVED` + outcome `WON`/`LOST`（对 token=`onChainId`）
  - Win：`total_balance += betMoney * odds`，订单 `money=盈利`
  - Lose：余额不变（下单已扣本金），订单 `money=-betMoney`
  - 触发：`Pf_RefreshBalance` / `Pf_GetOrders` / `Pf_SettleOpenOrders`
- **卖出（1:1）**：订单栏对未结买单 → `Pf_SubmitSell({ buyOrderId })`
  - house 主号 MARKET FOK **SELL**；changmen 账号仅归属，不影响链上仓位归属逻辑
  - POST 受理后 **轮询官方 GetOrder 至 FILLED** 才入账；CANCELLED/超时 **不** 改买单、不加余额
  - 回款/份额优先官方 `amount` / `amountFilled` / order taker|maker，预估作 fallback
  - **经济口径在买单**：`pfSellProceeds`=官方回款真相源，`money`=盈亏（proceeds−stake），`pfSellState=closed`
  - **卖单行**：官方卖出凭证 + 订单栏展示；`betMoney`=回款镜像（勿当本金），`money` 恒 0（不进组盈亏）
  - 一张卖单只绑一张买单（`pfBuyOrderId`）
  - 余额：`total_balance += proceeds`
- 买单 FILLED：校正 `pfSharesWei`，并把 `betMoney` 回写为官方成交 USDT（`executedValue` / BUY `makerAmount`）；会员余额仍以下单扣款为准
- 下单前校验 `tradingStatus=OPEN` 且市场非 RESOLVED/PAUSED/REMOVED
- 到期 Win 后 best-effort `redeemPositions`（主号回笼 USDT）；管理端 `Pf_HouseRedeemResolved`
- 余额：`players.total_balance`（`Pf_RefreshBalance`）；下单成功扣减；**不用** A8 `credit`
- VPS：主号 B 私钥签 PF JWT + EIP-712 MARKET FOK；No 侧 orderbook 按官方 `getComplement`
- 首次下单前自动 `OrderBuilder.setApprovals()`（进程内只成功一次；`PF_HOUSE_SKIP_APPROVALS=1` 可跳过）
- 订单确认：`GetOrder` 轮询 + VPS 订阅 `predictWalletEvents`（`orderTransactionSuccess`/`Cancelled` 等加速终态；`PF_HOUSE_SKIP_WALLET_EVENTS=1` 可关）
- 用户账号：`{ "mode": "house" }` 占位，**必须有** `accountId`/`playerId`
- 浏览器 **不再** 持有主号私钥；配置见 `server/backend/.env`：`PREDICT_FUN_PRIVY_PRIVATE_KEY` / `PREDICT_FUN_PREDICT_ACCOUNT` / `PREDICT_FUN_API_KEY`

## 与 Polymarket 差异


| | Polymarket | Predict.fun（模式 A） |

|--|------------|----------------------|

| 账号 | 每用户 token + L2 | 运营主号 env（VPS）+ 用户 house 占位 |

| HTTP 采集 | 浏览器插件代发 | **VPS 单进程** |

| 下单 | `Pm_*`（VPS 或浏览器 L2） | **`Pf_*` 仅 VPS 全签** |

| 签名 | 私钥 + L2 HMAC | 私钥 + JWT（仅服务器） |

| User WS | PM-USER | **VPS** `predictWalletEvents/{jwt}`（加速确认；浏览器不接） |

| 推荐/PP | 无 | 主号运营 |



## 文件



| 文件 | 职责 |

|------|------|

| `collect.ts` | 浏览器 WS + MarketIndex 同步 |

| `marketIndex.ts` | VPS 索引 → 本地映射 |

| `bet.ts` | checkBet / betting / getOrders / resolveLegOutcome |
| `legOutcome.ts` | PF 订单确认轮询（仅本场馆） |
| `pfClientApi.ts` | Pf_CheckBet / Submit / GetOrder / GetOrders |

| `masterAccount.ts` | 模式 A 主号凭证 |

| `credentials.ts` | token 解析 |

| `auth.ts` | JWT |

| `api.ts` / `transport.ts` | REST + relay（下注/checkBet） |

| `server/collectors/predictfun-collector/` | VPS HTTP 采集守护进程 |

