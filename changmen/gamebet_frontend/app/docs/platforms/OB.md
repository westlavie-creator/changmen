# OB 采集

> **A8 对照**（Token / 采集 / 下注）：见 [A8_COMPARE_OB_RAY.md](./A8_COMPARE_OB_RAY.md#ob-平台)。  
> **复刻计划**（A8 前端基线）：见 [../../docs/A8_OB_REPLICATE_PLAN.md](../../docs/A8_OB_REPLICATE_PLAN.md)。

## 入口

`ob/index.ts` → `startObCollector()`

## 数据流

### 模式 P — A8 Parity（**复刻目标**，对齐 UMe）

```text
HTTP game/index (30s, flag=1&day=1)
  → 过滤 game_id + start_time
  → buildMatchesFromList → saveMatch          ← CollectConfig 开时回传
  → 每场 unsub → loadMarketsForMatch → saveBets → subscribe
MQTT（约 3s 后 connectObMqtt）
  → 订阅 odd/* + market/*（与 A8 n9 一致）
  → **处理** /market/oddsUpdate|statusUpdate|suspended → fo
  → /odd/* 等无 handler（与 A8 UMe 相同）
syncObLiveTimer → API_SaveLiveTimer
```

CollectConfig 关：仍 game/view + fo + MQTT；**不** saveMatch/saveBets。

### 模式 D — Changmen 双轨（**当前 dev 默认**）

```text
比赛列表：Node ObFeed + ESPORT_BRIDGE → matches.json（可与浏览器 saveMatch 并存，parity 时关 bridge）
赔率/id：  前端 loadMarketsForMatch → saveBets + fo（与 A8 saveBets/fo 一致）
```

详见 [changmen/readme.md](../../../../../readme.md#项目共识)。

## 开赛时间过滤（对齐 A8）

```ts
const horizon = Date.now() / 1000 + 3600;
list.filter(row => games.includes(gid) && num(row.start_time) < horizon);
```

`StartTime` 存 **毫秒**：`start_time * 1000`（`ob/matches.ts`）。

## 盘口

| 模块 | 作用 |
|------|------|
| `ob/markets.ts` | 按 BO 拉各局 `loadMarketsForMatch` |
| `ob/winMarket.ts` | A8 GameID → OB game_id 映射（备用） |
| `ob/parse.ts` | 数值/字段解析 |
| `platform.BetName` | 正则过滤可采集盘口名 |

## 认证（采集）

| 项 | 说明 |
|----|------|
| 常态 | `getCollectPlatform("OB")` → `Client_GetCollectPlatform`（`Gateway` + `Token`） |
| 失效 | `game/index` 且 `data === "token"` → `refreshObCollectToken()`（直连 A8 同款试玩 URL，只写 `token`） |
| HTTP | `ob/http.ts` → `directGet`（**Axios/XHR**，对齐 A8 `Rr.get`）直连 OB `gateway` |
| MQTT | 固定 relay 账号，**不用** platform token |

试玩 UI：`api/v4.ts` → `enterCreditPlate("OB")`（仅 `window.open(pc)`，不写采集配置）。

下注凭证：剪贴板账号 → `ACCOUNT` → `obProvider`（与采集配置分离）。

## MQTT topic（对齐 A8 UMe）

| Topic 前缀 | 订阅 | fo handler |
|------------|------|------------|
| `/market/oddsUpdate/` | ✅ | ✅ 更新 odd |
| `/market/statusUpdate/` | ✅ | ✅ 整盘锁 |
| `/market/suspended/` | ✅ | ✅ 整盘锁 |
| `/odd/insert/` … `/odd/suspended/` | ✅ | ❌ 与 A8 相同，无 handler |
| `/market/visible/`、`sortCodeUpdate/` | ✅ | ❌ |

锁盘主路径：`game/view` 灌盘时的 `Status` + 上述 market 三 topic。`oddsStore.applyObOddLock` 预留未接线。

## 下注（obProvider）

| 步骤 | API | 凭证 |
|------|-----|------|
| 余额 / uid | `GET /game/balance` | ACCOUNT |
| 验盘 | `POST /game/bet`（probe 1 元） | secret_key = md5(token_ts_uid_) |
| 下单 | `POST /game/bet` | 同上 |
| 注单 | `GET /game/orderList` | status 1/2 |

离线契约校验：`npm run test:ob-provider`

Live 冒烟（后端 3456，默认账号 TJ01）：`ESPORT_TEST_BASE=http://127.0.0.1:3456 npm run test:ob-live`  
SaveMatch 写入 round-trip（自动备份/恢复 OB 数据）：`OB_SMOKE_WRITE=1` 同上。
