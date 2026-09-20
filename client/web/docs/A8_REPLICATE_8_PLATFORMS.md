# A8 复刻：OB / IM / TF / PB / RAY / IMT / STAKE / IA

对照基线：`A8/A8frontendscipts/2.0.1/index.js`�?
changmen 实现：`packages/venue-adapter/{platform}/`（`collect.ts` / `bet.ts`）、`server/backend/core/esport-api`；插件桥 `@/chrome-plugin/bridge.ts`�?
---

## 用户中心「赛事采集」开关（重要�?
**开关含义：是否把数据回传到服务�?*（`Client_SaveMatch` / `Client_SaveBets`），**不是**是否在前端向场馆拉赔率�?
| 层级 | 行为 |
|------|------|
| `collectStore.saveMatch` / `saveBets` | 开关关闭时直接 `return false`，不调后�?|
| 各平�?`packages/venue-adapter/{platform}/` | **应常驻运�?*（HTTP/WS/插件），继续�?`oddsStore`、刷新主列表 |
| `runtime/collectors.ts` | 不因开关关闭�?`stop` 采集�?|

对齐 A8 Pinia `Tf`：`saveMatch` / `saveBet` 内判�?`e.collect.get(platform)`�?
---

## 复刻三模式（先认模式再改代码�?
| 模式 | 平台 | 采集 | 下注 |
|------|------|------|------|
| **A** 场馆 HTTP/WS | OB、RAY、TF、IA、IMT | `Client_GetCollectPlatform` + 轮询/WS | 账号 `ACCOUNT` + `*Provider` |
| **B** A8 聚合 Socket | IM | `socketHub` 频道 `IM`，JWT=`localStorage.token` | 账号 + `imProvider` |
| **C** 浏览器插�?| PB、STAKE | 扩展代发 HTTP；Stake 另订频道 `Stake` | 账号 token + tabId + `*Provider` |

**共�?*：采集凭�?�?下注凭证。下注一律用「平台账号设置」里粘贴�?gateway/token�?
---

## 总览

| 平台 | 采集 | 下注 | changmen 状�?| 复刻验收重点 |
|------|------|------|---------------|--------------|
| OB | HTTP `game/index`+`view` + MQTT `/esport/ws/OB` | `obProvider` | �?主链已对�?| 模式 P 验收、CollectConfig 开回传 |
| IM | A8 Socket `IM` | `imProvider` | �?已对�?| 登录 JWT、频道赔�?suffix 1/2 |
| TF | REST 30s + 赔率 WS | `tfProvider` | �?已对�?| `getTfA8CollectCredentials`、tf-authorization |
| PB | 扩展 GET（须有余额账号） | `pbProvider` | �?需扩展 | 装插件、PB 账号刷余额、lineId |
| RAY | HTTP `/v2` + SC `/esport/ws/RAY` | `rayProvider` | �?已对�?| 后端写死 JWT，勿改用�?token |
| IMT | 快照 + Delta `mobilesitev2` | `imtProvider` | �?已对�?| gateway+token+已登录账�?|
| STAKE | GraphQL 30s + 频道 `Stake` | `stakeProvider` | �?需扩展+tab | tabId、GraphQL 下注 |
| IA | HTTP 列表 + WS `/esport/ws/IA` | `iaProvider` | �?默认凭证已补 | �?token、ilustre gateway |

---

## 按平台：A8 怎么�?�?changmen 改哪 �?怎么验收

### OB

| �?| 内容 |
|----|------|
| A8 [可证实] | `UMe`：`getPlatform(OB)` �?`game/index` �?**saveMatch** �?`game/view` �?saveBets + fo；`token` 失效 �?`$Me` 试玩写回；MQTT admin（与 platform token 无关�?|
| 代码 | `packages/venue-adapter/ob/*` | `packages/venue-adapter/ob/bet.ts` |
| 凭证 | `platforms.json` OB；[changmen 扩展] �?`syncObLogin` |
| 下注 | 粘贴 OB 账号 JSON �?`ACCOUNT` |
| **parity 缺口** | �?| 模式 P 下浏览器 saveMatch + 顺序灌盘 |
| 验收 | CollectConfig 开 OB �?Network：`API_SaveMatch?OB` + `API_SaveBet?OB` + `game/index`/`view` + MQTT |

### IM

| �?| 内容 |
|----|------|
| A8 | **�?*拉场�?HTTP 列表；`join room` �?`IM`；`EZe` �?`oddsStore` |
| 代码 | `packages/venue-adapter/im/*` | `packages/venue-adapter/im/bet.ts` |
| 凭证 | Socket：`localStorage.getItem("token")`（A8 登录 JWT�?|
| 下注 | IM 账号 gateway/token �?`imProvider` |
| 验收 | �?登录�?Socket �?`47.115.75.57` �?�?`join room` / `IM` 推�?�?主列�?IM 盘有赔率 �?�?IM 账号下单 |

### TF

| �?| 内容 |
|----|------|
| A8 | `UBe`：`getPlatform(TF)`；`/api/v8/events` + 赔率 WS；下�?`bYe` |
| 代码 | `packages/venue-adapter/tf/*` | `packages/venue-adapter/tf/bet.ts` |
| 凭证 | `Client_GetCollectPlatform` �?`getTfA8CollectCredentials()`（可�?A8 服或 env�?|
| 验收 | �?`Client_GetCollectPlatform` �?Gateway/Token �?30s 轮询 events �?WS 赔率更新 �?TF 账号下单 |

### PB

| �?| 内容 |
|----|------|
| A8 | `AQ`：须�?PB 账号�?`balance!==undefined`；`Zn.get` 扩展请求；`TQ` 缓存 lineId |
| 代码 | `packages/venue-adapter/pb/*` | `packages/venue-adapter/pb/bet.ts` |
| 凭证 | 采集�?*有余额的 PB 账号**（非 platforms.json）；下注：同账号 |
| 验收 | �?安装 Gamebet/A8 扩展 �?PB 账号粘贴并刷余额 �?采集开关开 PB �?下单�?lineId |

### RAY

| �?| 内容 |
|----|------|
| A8 | `vQe`�?*写死** `cfinfo.365raylinks.com` + Bearer JWT（不�?getPlatform�?|
| 代码 | `packages/venue-adapter/ray/*` | `packages/venue-adapter/ray/bet.ts` |
| 凭证 | `router.js` + `devtools/platform-probes/ray/collect_credentials.js` 强制返回 A8 JWT |
| 下注 | RAY 账号自己�?gateway/token |
| 验收 | �?`Client_GetCollectPlatform(RAY)` �?A8 JWT �?`/v2/match` �?SC 频道 match �?RAY 账号 `/v2/order` |

### IMT

| �?| 内容 |
|----|------|
| A8 | `Pee`/`jQe`：`getPlatform(IMT)` + 已登�?IMT 账号�?0s 快照 + Delta |
| 代码 | `packages/venue-adapter/imt/*` | `packages/venue-adapter/imt/bet.ts` |
| 凭证 | `resolveCollectSession("IMT")`：账号优先，否则 platforms.json |
| 验收 | �?IMT 账号有余�?�?`GetAllLiveEvents` / Delta �?主列�?IMT 赔率 �?IMT 下单 |

### STAKE

| �?| 内容 |
|----|------|
| A8 | `MQ`：等 `qs.tabId`�?0×3s）→ GraphQL �?sport �?`saveMatch`/`saveBets` �?频道 `Stake`；下�?`rJe` �?tabId |
| 代码 | `packages/venue-adapter/stake/*` | `packages/venue-adapter/stake/bet.ts` |
| 凭证 | 采集：`STAKE_ACCESS_TOKEN` 等；实时：A8 Socket；下注：账号 `x-access-token` + tabId |
| 验收 | �?扩展 + Stake 标签�?�?控制台无「未找到 Stake 标签页�?�?GraphQL 快照 �?Stake 账号下注 |

### IA

| �?| 内容 |
|----|------|
| A8 | `wQe`：ilustre + �?token + `Zn` HTTP + WS `/esport/ws/IA`；`CYe`：`mr.post`（Zn / PROXY�?|
| 代码 | `ia/*`（`bet_transport.ts` = `mr.post`�?| `ia/bet.ts` |
| 凭证 | 采集写死 `a8Collect`；下注用 IA 账号 gateway/token | |
| 验收 | �?扩展已装 �?HTTP 列表 30s �?WS（上游可用时）④ IA 账号 checkBet/playMore | |

---

## 环境 / 启动配置（后端）

| 平台 | 建议 |
|------|------|
| OB | `OB_*` �?`syncObLogin` |
| TF | 自动 `getTfA8CollectCredentials` �?`TF_GATEWAY`/`TF_TOKEN` |
| RAY | 无需 env（写死） |
| IA | �?env 时用 A8 默认；可覆盖 `IA_GATEWAY` / `IA_TOKEN` |
| IMT | `IMT_GATEWAY`/`IMT_TOKEN` �?feed session |
| PB | PB feed session 或账号余�?|
| STAKE | `STAKE_ACCESS_TOKEN` + 浏览器扩�?|
| IM | A8 登录即可（Socket JWT�?|

重启后端后检�?`data/esport/platforms.json`�?
---

## 账号粘贴�? 平台通用�?
`AccountEditDialog` �?快速填�?�?base64 JSON�?
```json
{
  "provider": "OB",
  "token": "...",
  "referer": "...",
  "gateway": "https://..."
}
```

多网�?PB 可为 `"gateway": ["url1","url2"]`（PB 会测速选最快）�?
---

## 推荐复刻顺序（联调）

1. **OB** �?主盘 + MQTT
2. **IM** �?确认 A8 Socket 有赔�?
3. **RAY** �?写死凭证是否�?
4. **TF** �?GetCollectPlatform + WS
5. **IMT** �?账号 + Delta
6. **IA** �?默认 gateway + �?token
7. **PB** �?扩展 + 余额
8. **STAKE** �?tabId + GraphQL + 下注

同屏走查表：[A8_WALKTHROUGH_CHECKLIST.md](./A8_WALKTHROUGH_CHECKLIST.md)

---

## 代码索引

| 平台 | 采集 | 下注 | 文档 |
|------|------|------|------|
| OB | `packages/venue-adapter/ob/` | `packages/venue-adapter/ob/bet.ts` | [OB.md](./platforms/OB.md) |
| IM | `packages/venue-adapter/im/` | `packages/venue-adapter/im/bet.ts` | [IM.md](./platforms/IM.md) |
| TF | `packages/venue-adapter/tf/` | `packages/venue-adapter/tf/bet.ts` | [A8_TF_LOGIC_PARITY.md](./platforms/A8_TF_LOGIC_PARITY.md) |
| PB | `packages/venue-adapter/pb/` | `packages/venue-adapter/pb/bet.ts` | [A8_PB_LOGIC_PARITY.md](./platforms/A8_PB_LOGIC_PARITY.md) |
| RAY | `packages/venue-adapter/ray/` | `packages/venue-adapter/ray/bet.ts` | [RAY.md](./platforms/RAY.md) |
| IMT | `packages/venue-adapter/imt/` | `packages/venue-adapter/imt/bet.ts` | [IMT.md](./platforms/IMT.md) |
| STAKE | `packages/venue-adapter/stake/` | `packages/venue-adapter/stake/bet.ts` | [Stake.md](./platforms/Stake.md) |
| IA | `packages/venue-adapter/ia/` | `packages/venue-adapter/ia/bet.ts` | [IA.md](./platforms/IA.md) |

共享：[A8_COMPARE_ALL_PLATFORMS.md](./platforms/A8_COMPARE_ALL_PLATFORMS.md)、`packages/venue-adapter/shared/socket/hub.ts`、`src/chrome-plugin/bridge.ts`

---

*IA 默认凭证：`devtools/platform-probes/ia/collect_credentials.js`（A8 �?token）�?
