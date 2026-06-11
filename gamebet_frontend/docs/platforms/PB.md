# PB（平博）采集

## 入口

`pb/index.ts` → `startPbCollector()`

## 流程（对齐 A8 `AQ` / `_Ze`）

```text
getCollectPlatform(PB)  // 仅 games 配置
resolvePbCollectAccount()  // bv：PB + balance!==undefined，不用 platforms.json
  → collectPbGet (Zn.get / 扩展) pbOddsUrl
  → parseEuroOddsPayload (allowedSlugs from getGames)
  → setPbLineId(`${matchId}:${map}`, lineId)  // TQ
  → oddsStore 实时 + 每 60s saveMatch/saveBets
```

轮询 **5s**；批量落库 **60s**（`SAVE_MS`）；无已登录有余额账号时 **3s** 且 `clean(PB)`。

## 下注（对齐 A8 `PZe`）

| 步骤 | 扩展 HTTP |
|------|-----------|
| getBalance | POST account-balance |
| checkBet | POST all-odds-selections（仅 `getPbLineId`） |
| betting | POST buyV4 |
| 拒单 | GET my-bets → `_Q` / sessionStorage |
| 订单 | POST wager-filter OPEN + SETTLED |

请求头：`buildPbAuthHeaders`（A8 `k0`，固定 `515`）。

## 子模块

| 文件 | 说明 |
|------|------|
| `pb/core.ts` | 欧赔解析、logo、URL |
| `pb/http.ts` | 采集 GET（扩展） |
| `pb/pluginHttp.ts` | PB 场馆 Zn 封装 |
| `pb/session.ts` | `bv` 采集账号 |
| `pb/lineCache.ts` | `TQ` lineId |
| `providers/pbProvider.ts` | 下注 Provider |
| `providers/pbRejectPoll.ts` | `_Q` 拒单轮询 |

## 凭证

- **采集**：必须 PB 账号且已 `updateBalance` 成功（`balance !== undefined`）
- **下注**：剪贴板 `ACCOUNT` 各账号 gateway/token
- **HTTP**：Chrome 安装 `gamebet_chromeplug` 时走 A8 `Zn`；**Electron / 无扩展** 时走同源 `/esport/http-relay` 代发（见 `transport.ts`）

对照表：[`A8_PB_LOGIC_PARITY.md`](./A8_PB_LOGIC_PARITY.md)
