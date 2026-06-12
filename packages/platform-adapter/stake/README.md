# Stake 平台适配器

GraphQL 下单 / 余额 / 订单 + 插件 GraphQL 采集 + A8 Socket 赔率频道。

## 目录

| 路径 | 说明 |
|------|------|
| `frontend/bet.ts` | Provider：`getBalance` / `checkBet` / `betting` / `getOrders` |
| `frontend/collect.ts` | 浏览器采集（插件 GraphQL + WS） |
| `frontend/pluginApi.ts` | 经 Chrome 扩展在 stake.com 标签页发 GraphQL |
| `frontend/tabId.ts` | 读取扩展绑定的 Stake tabId |
| `backend/` | CLI 调试脚本；**无**服务端 Feed 模块 |

## 联调前置

1. 安装 `changmen/gamebet_chromeplug` 扩展，登录 GameBet 控制台。
2. 浏览器打开 [stake.com](https://stake.com) 并完成登录；扩展写入 `tabId`。
3. 用户配置里启用 Stake 采集；账号配置 `token`（x-access-token）与 `gateway`。
4. 前端 `HomeView` 会调用 `primeStakeTabId()` 预取 tabId。

## 下单路径（对齐 A8 `eu` Provider）

```
accountStore.betting()
  → stakeProvider.checkBet()   // SportMarketOutcome + 本地限红 + 30s 同盘口节流
  → stakeProvider.betting()    // sportBet mutation，经 a8PluginPost + tabId
```

常见失败：

| 消息 | 原因 |
|------|------|
| `未找到 Stake 标签页…` | 未打开 stake.com 或扩展未绑定 tab |
| `请稍等 30 秒后再重下…` | 同 `betId` 节流 |
| `本地限红：…` | `oddsStore` 限红缓存 |
| `rejectedBetLimitExceededForBetReoffer` | 场馆限红，会写入本地限红 |

## 单元测试

```bash
cd changmen/gamebet_frontend
npm test -- ../../platform_adapter/stake/frontend
```

覆盖：订单状态映射、USDT→CNY 换算、tabId 解析、限红判断。

## manifest

`registry/manifest.json`：`bet: true`，`pluginOnly: true`，`implementation: "done"`。
