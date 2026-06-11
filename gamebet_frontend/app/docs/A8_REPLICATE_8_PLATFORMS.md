# A8 复刻：OB / IM / TF / PB / RAY / IMT / STAKE / IA

对照基线：**仅** `A8/A8frontendscipts/2.0.1/index.js`（不用 `vendor/ui-bundle`）。  
changmen 实现：`platform_adapter/*/frontend`、`platform_adapter/*/frontend/bet.ts`、`gamebet_backend/core/esport-api`；插件桥 `@/extension/bridge.ts`。

---

## 用户中心「赛事采集」开关（重要）

**开关含义：是否把数据回传到服务器**（`Client_SaveMatch` / `Client_SaveBets`），**不是**是否在前端向场馆拉赔率。

| 层级 | 行为 |
|------|------|
| `collectStore.saveMatch` / `saveBets` | 开关关闭时直接 `return false`，不调后端 |
| 各平台 `platform_adapter/*/frontend` | **应常驻运行**（HTTP/WS/插件），继续写 `oddsStore`、刷新主列表 |
| `runtime/collectors.ts` | 不因开关关闭而 `stop` 采集器 |

对齐 A8 Pinia `Tf`：`saveMatch` / `saveBet` 内判断 `e.collect.get(platform)`。

---

## 复刻三模式（先认模式再改代码）

| 模式 | 平台 | 采集 | 下注 |
|------|------|------|------|
| **A** 场馆 HTTP/WS | OB、RAY、TF、IA、IMT | `Client_GetCollectPlatform` + 轮询/WS | 账号 `ACCOUNT` + `*Provider` |
| **B** A8 聚合 Socket | IM | `socketHub` 频道 `IM`，JWT=`localStorage.token` | 账号 + `imProvider` |
| **C** 浏览器插件 | PB、STAKE | 扩展代发 HTTP；Stake 另订频道 `Stake` | 账号 token + tabId + `*Provider` |

**共性**：采集凭证 ≠ 下注凭证。下注一律用「平台账号设置」里粘贴的 gateway/token。

---

## 总览

| 平台 | 采集 | 下注 | changmen 状态 | 复刻验收重点 |
|------|------|------|---------------|--------------|
| OB | HTTP `game/index`+`view` + MQTT `/esport/ws/OB` | `obProvider` | ✅ 主链已对齐 | 模式 P 验收、CollectConfig 开回传 |
| IM | A8 Socket `IM` | `imProvider` | ✅ 已对齐 | 登录 JWT、频道赔率 suffix 1/2 |
| TF | REST 30s + 赔率 WS | `tfProvider` | ✅ 已对齐 | `getTfA8CollectCredentials`、tf-authorization |
| PB | 扩展 GET（须有余额账号） | `pbProvider` | ✅ 需扩展 | 装插件、PB 账号刷余额、lineId |
| RAY | HTTP `/v2` + SC `/esport/ws/RAY` | `rayProvider` | ✅ 已对齐 | 后端写死 JWT，勿改用户 token |
| IMT | 快照 + Delta `mobilesitev2` | `imtProvider` | ✅ 已对齐 | gateway+token+已登录账号 |
| STAKE | GraphQL 30s + 频道 `Stake` | `stakeProvider` | ✅ 需扩展+tab | tabId、GraphQL 下注 |
| IA | HTTP 列表 + WS `/esport/ws/IA` | `iaProvider` | ✅ 默认凭证已补 | 空 token、ilustre gateway |

---

## 按平台：A8 怎么做 → changmen 改哪 → 怎么验收

### OB

| 项 | 内容 |
|----|------|
| A8 [可证实] | `UMe`：`getPlatform(OB)` → `game/index` → **saveMatch** → `game/view` → saveBets + fo；`token` 失效 → `$Me` 试玩写回；MQTT admin（与 platform token 无关） |
| 代码 | `platform_adapter/ob/frontend/*` | `platform_adapter/ob/frontend/bet.ts` |
| 凭证 | `platforms.json` OB；[changmen 扩展] 可 `syncObLogin` |
| 下注 | 粘贴 OB 账号 JSON → `ACCOUNT` |
| **parity 缺口** | — | 模式 P 下浏览器 saveMatch + 顺序灌盘 |
| 验收 | CollectConfig 开 OB → Network：`API_SaveMatch?OB` + `API_SaveBet?OB` + `game/index`/`view` + MQTT |

### IM

| 项 | 内容 |
|----|------|
| A8 | **不**拉场馆 HTTP 列表；`join room` → `IM`；`EZe` 写 `oddsStore` |
| 代码 | `platform_adapter/im/frontend/*` | `platform_adapter/im/frontend/bet.ts` |
| 凭证 | Socket：`localStorage.getItem("token")`（A8 登录 JWT） |
| 下注 | IM 账号 gateway/token → `imProvider` |
| 验收 | ① 登录后 Socket 连 `47.115.75.57` ② 见 `join room` / `IM` 推送 ③ 主列表 IM 盘有赔率 ④ 用 IM 账号下单 |

### TF

| 项 | 内容 |
|----|------|
| A8 | `UBe`：`getPlatform(TF)`；`/api/v8/events` + 赔率 WS；下注 `bYe` |
| 代码 | `platform_adapter/tf/frontend/*` | `platform_adapter/tf/frontend/bet.ts` |
| 凭证 | `Client_GetCollectPlatform` → `getTfA8CollectCredentials()`（可拉 A8 服或 env） |
| 验收 | ① `Client_GetCollectPlatform` 有 Gateway/Token ② 30s 轮询 events ③ WS 赔率更新 ④ TF 账号下单 |

### PB

| 项 | 内容 |
|----|------|
| A8 | `AQ`：须有 PB 账号且 `balance!==undefined`；`Zn.get` 扩展请求；`TQ` 缓存 lineId |
| 代码 | `platform_adapter/pb/frontend/*` | `platform_adapter/pb/frontend/bet.ts` |
| 凭证 | 采集：**有余额的 PB 账号**（非 platforms.json）；下注：同账号 |
| 验收 | ① 安装 Gamebet/A8 扩展 ② PB 账号粘贴并刷余额 ③ 采集开关开 PB ④ 下单带 lineId |

### RAY

| 项 | 内容 |
|----|------|
| A8 | `vQe`：**写死** `cfinfo.365raylinks.com` + Bearer JWT（不读 getPlatform） |
| 代码 | `platform_adapter/ray/frontend/*` | `platform_adapter/ray/frontend/bet.ts` |
| 凭证 | `router.js` / `ray_a8_collect.js` 强制返回 A8 JWT |
| 下注 | RAY 账号自己的 gateway/token |
| 验收 | ① `Client_GetCollectPlatform(RAY)` 为 A8 JWT ② `/v2/match` ③ SC 频道 match ④ RAY 账号 `/v2/order` |

### IMT

| 项 | 内容 |
|----|------|
| A8 | `Pee`/`jQe`：`getPlatform(IMT)` + 已登录 IMT 账号；60s 快照 + Delta |
| 代码 | `platform_adapter/imt/frontend/*` | `platform_adapter/imt/frontend/bet.ts` |
| 凭证 | `resolveCollectSession("IMT")`：账号优先，否则 platforms.json |
| 验收 | ① IMT 账号有余额 ② `GetAllLiveEvents` / Delta ③ 主列表 IMT 赔率 ④ IMT 下单 |

### STAKE

| 项 | 内容 |
|----|------|
| A8 | `MQ`：等 `qs.tabId`（10×3s）→ GraphQL 各 sport → `saveMatch`/`saveBets` → 频道 `Stake`；下注 `rJe` 要 tabId |
| 代码 | `platform_adapter/stake/frontend/*` | `platform_adapter/stake/frontend/bet.ts` |
| 凭证 | 采集：`STAKE_ACCESS_TOKEN` 等；实时：A8 Socket；下注：账号 `x-access-token` + tabId |
| 验收 | ① 扩展 + Stake 标签页 ② 控制台无「未找到 Stake 标签页」 ③ GraphQL 快照 ④ Stake 账号下注 |

### IA

| 项 | 内容 |
|----|------|
| A8 | `wQe`：gateway=`https://ilustre-analytics.org`，**`token:""`**；HTTP `gameListPageSplit` + WS `/esport/ws/IA` |
| 代码 | `platform_adapter/ia/frontend/*` | `platform_adapter/ia/frontend/bet.ts` |
| 凭证 | **已补** `shared/ia_a8_collect.js` + `router.js` / `platform_sync` 默认写入 |
| 验收 | ① 无 env 时 `Client_GetCollectPlatform(IA)` 仍有 Gateway ② HTTP 列表 ③ WS 推赔率 ④ IA 账号下注 |

---

## 环境 / 启动配置（后端）

| 平台 | 建议 |
|------|------|
| OB | `OB_*` 或 `syncObLogin` |
| TF | 自动 `getTfA8CollectCredentials` 或 `TF_GATEWAY`/`TF_TOKEN` |
| RAY | 无需 env（写死） |
| IA | 无 env 时用 A8 默认；可覆盖 `IA_GATEWAY` / `IA_TOKEN` |
| IMT | `IMT_GATEWAY`/`IMT_TOKEN` 或 feed session |
| PB | PB feed session 或账号余额 |
| STAKE | `STAKE_ACCESS_TOKEN` + 浏览器扩展 |
| IM | A8 登录即可（Socket JWT） |

重启后端后检查 `data/esport/platforms.json`。

---

## 账号粘贴（8 平台通用）

`AccountEditDialog` → 快速填充 → base64 JSON：

```json
{
  "provider": "OB",
  "token": "...",
  "referer": "...",
  "gateway": "https://..."
}
```

多网关 PB 可为 `"gateway": ["url1","url2"]`（PB 会测速选最快）。

---

## 推荐复刻顺序（联调）

1. **OB** — 主盘 + MQTT  
2. **IM** — 确认 A8 Socket 有赔率  
3. **RAY** — 写死凭证是否通  
4. **TF** — GetCollectPlatform + WS  
5. **IMT** — 账号 + Delta  
6. **IA** — 默认 gateway + 空 token  
7. **PB** — 扩展 + 余额  
8. **STAKE** — tabId + GraphQL + 下注  

同屏走查表：[A8_WALKTHROUGH_CHECKLIST.md](./A8_WALKTHROUGH_CHECKLIST.md)

---

## 代码索引

| 平台 | 采集 | 下注 | 文档 |
|------|------|------|------|
| OB | `platform_adapter/ob/frontend/` | `platform_adapter/ob/frontend/bet.ts` | [OB.md](./platforms/OB.md) |
| IM | `platform_adapter/im/frontend/` | `platform_adapter/im/frontend/bet.ts` | [IM.md](./platforms/IM.md) |
| TF | `platform_adapter/tf/frontend/` | `platform_adapter/tf/frontend/bet.ts` | [A8_TF_LOGIC_PARITY.md](./platforms/A8_TF_LOGIC_PARITY.md) |
| PB | `platform_adapter/pb/frontend/` | `platform_adapter/pb/frontend/bet.ts` | [A8_PB_LOGIC_PARITY.md](./platforms/A8_PB_LOGIC_PARITY.md) |
| RAY | `platform_adapter/ray/frontend/` | `platform_adapter/ray/frontend/bet.ts` | [RAY.md](./platforms/RAY.md) |
| IMT | `platform_adapter/imt/frontend/` | `platform_adapter/imt/frontend/bet.ts` | [IMT.md](./platforms/IMT.md) |
| STAKE | `platform_adapter/stake/frontend/` | `platform_adapter/stake/frontend/bet.ts` | [Stake.md](./platforms/Stake.md) |
| IA | `platform_adapter/ia/frontend/` | `platform_adapter/ia/frontend/bet.ts` | [IA.md](./platforms/IA.md) |

共享：[A8_COMPARE_ALL_PLATFORMS.md](./platforms/A8_COMPARE_ALL_PLATFORMS.md)、`platform_adapter/shared/socket/hub.ts`、`app/src/extension/bridge.ts`

---

*IA 默认凭证：`platform_adapter/ia/backend/collect_credentials.js`（A8 空 token）。*
