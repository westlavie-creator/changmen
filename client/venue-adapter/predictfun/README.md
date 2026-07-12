# Predict.fun 场馆适配器

## 模式 A（已定：运营主号 / house）

全站 Predict.fun 套利 **共用运营者一个主号** 下单；changmen 用户 **无需** 在 predict.fun 开户。

| 角色 | 说明 |
|------|------|
| 运营主号 | 持有 USDT、PP、推荐奖励；JWT + EIP-712 签名下单 |
| changmen 用户 | `PlatformAccount.token` 仅占位 `{ "mode": "house" }`，用于玩家/订单归属 |
| 采集 | 任意用户浏览器 + HK relay（`x-api-key` + ws-forward） |

### 环境变量（运营主号）

生产构建注入（`.env.production` / GHA Secrets）：

```env
VITE_PREDICT_FUN_API_BASE=https://api.predict.fun
VITE_PREDICT_FUN_API_KEY=<主网 API Key>

# 模式 A 主号（Predict Account 推荐）
VITE_PREDICT_FUN_PRIVY_PRIVATE_KEY=<从 predict.fun/account/settings 导出>
VITE_PREDICT_FUN_PREDICT_ACCOUNT=<deposit address / Predict Account>

# 或纯 EOA（少见）
# VITE_PREDICT_FUN_MASTER_PRIVATE_KEY=<0x...>
```

VPS `server/backend/.env`：`PREDICT_FUN_API_KEY`（ws-forward 握手，与 REST key 相同）。

### 用户账号 token

```json
{ "mode": "house" }
```

联调时也可在**唯一** PredictFun 平台账号 token 里写私钥（`resolvePredictFunMasterCredentials` 在 env 缺失时回退）。

## 采集

- REST：`/v1/tags` → categories → markets → orderbook
- WS：`predictOrderbook/{marketId}`（经 `ws-forward`）
- `fo` 条目含 `marketId`（下注预检用）

## 下注（当前）

- `checkBet`：拉 orderbook + market 元数据，写 `PredictFunBuyCheckData`
- `betting`：走 `resolvePredictFunMasterCredentials` → SDK `MARKET` FOK `BUY` → `POST /v1/orders`
- `resolveLegOutcome`：占位 `timeout`（待 `predictWalletEvents` User WS）

## 与 Polymarket 差异

| | Polymarket | Predict.fun（模式 A） |
|--|------------|----------------------|
| 账号 | 每用户 token + L2 | 运营主号 env |
| 签名 | 私钥 + L2 HMAC | 私钥 + JWT |
| User WS | PM-USER | 未接 |
| 推荐/PP | 无 | 主号运营 |

## 文件

| 文件 | 职责 |
|------|------|
| `collect.ts` | 采集循环 |
| `bet.ts` | checkBet / betting |
| `masterAccount.ts` | 模式 A 主号凭证 |
| `credentials.ts` | token 解析 |
| `auth.ts` | JWT |
| `api.ts` / `transport.ts` | REST + relay |
