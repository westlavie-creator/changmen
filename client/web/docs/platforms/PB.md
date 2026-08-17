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

请求头：`buildPbAuthHeaders`（见下「会话类型」；实现 `client/venue-adapter/pb/auth.ts`）。

## 会话类型（从 token 判定）

**515 不是站点品牌名**，是平博前端在 `localStorage` / 请求头里用的**会话键后缀数字**（壳/皮肤 ID）。  
**看 token（插件 dump 的 localStorage JSON）即可判定会话形态**，不必先猜域名；`gateway` 只表示站点，`detectPbSessionMode` 以键名为准。

粘贴包常见两层：

1. 外层（或 `x-app-data`）：`BrowserSessionId*` / `custid*`
2. 内层 `token` JSON：`X-U` / `X-SLID` / `X-Lcu` 等（另一层鉴权，**不决定** 515 vs plain）

| token / `x-app-data` 里看到 | 会话类型 | 发出的 HTTP 头（节选） |
|----------------------------|----------|------------------------|
| `BrowserSessionId_515`、`custid_515` | **515**（经典） | `x-browser-session-id-515`、`x-custid-515` |
| `BrowserSessionId_1228`（或其它 `_*数字`） | **带后缀** | `…-1228`（数字即后缀） |
| `BrowserSessionId`、`custid`（无 `_数字`） | **plain** | `x-browser-session-id`、`x-custid` |

| 标签 | 含义 |
|------|------|
| [A8 可证实] | 前端 `xh`/`k0` **只写死 515**；插件 GetConfig 整包 dump `localStorage`，**不解析**会话类型 |
| [changmen 扩展] | `detectPbSessionMode`：515 / 任意数字后缀 / plain；`mergeInnerTokenHeaders` 合并内层 `x-*`；扩展复制前校验内层 `X-U`（`pb-credential.js`） |

**与预检的关系（plain 常见）**：`part888` / `ps3838` 一类多为 plain。`account-balance` 有时仍可通过；缺内层 `X-U` 时 `all-odds-selections` 常 HTTP 200 + `{"error":403}`。经典 515 往往不依赖 `X-U`。TOKEN ERROR UI 在 A8 侧等价于 `balance === undefined`（余额刷新失败），不是 PB 专用「token error」码解析。

页面路径（插件 Check）：[A8 可证实] `/esports-hub/`、`/compact/sports/` + `x-app-data`；[changmen 扩展] `/sports` + 登录会话字段。

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
- **下注**：剪贴板 `ACCOUNT` 各账号 gateway/token（会话类型见上「从 token 判定」）
- **HTTP**：Chrome 安装 `chrome-extension` 时走扩展代发；**Electron / 无扩展** 时走同源 `/esport/http-relay`（见 `transport.ts`）
- **实现**：`client/venue-adapter/pb/auth.ts`（`buildPbAuthHeaders` / `detectPbSessionMode`）；扩展 `chrome-extension/src/content/pb-credential.js`

对照表：[`A8_PB_LOGIC_PARITY.md`](./A8_PB_LOGIC_PARITY.md)  
WebSocket（旁路）：[`PB_WS.md`](./PB_WS.md)  
`rotNum` 归组：[`PB_ROTNUM_GROUPING.md`](./PB_ROTNUM_GROUPING.md)  
GetMatchs 对外假象（方案备忘）：[`PB_GETMATCHS_FACADE.md`](./PB_GETMATCHS_FACADE.md)

## LineID（`[changmen 扩展]`）

- SaveBet 可选字段 `LineID` ← `euro/odds` `moneyLine.lineId`  
- 落库 `platform_bets.line_id`（迁移 `039`）→ GetMatchs `Sources.PB.LineID`  
- 新前端下注优先读 `Sources.LineID`；**旧前端忽略该字段，仍用本机 `lineCache`**，不受影响  
- 本机采集仍写 `lineCache`（与 A8 `TQ` 并存）

