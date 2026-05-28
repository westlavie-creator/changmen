# OB 采集

> **A8 对照**（Token / 采集 / 下注）：见 [A8_COMPARE_OB_RAY.md](./A8_COMPARE_OB_RAY.md#ob-平台)。

## 入口

`ob/index.ts` → `startObCollector()`

## 数据流

```text
HTTP game/index (30s)
  → 过滤 game_id + start_time
  → buildMatchesFromList → saveMatch
  → 每场 unsub → loadMarketsForMatch → saveBets → subscribe（默认 4 场并行）
MQTT（启动约 3s 后 connectObMqtt）
  → 仅处理 /market/oddsUpdate|statusUpdate|suspended；UI 刷新 debounce 200ms
syncObLiveTimer → 后端 live_timers.json
```

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

## 队徽

`ensureObTeamLogosLoaded()` 预加载队徽映射，写入 `Teams[].Logo`。

## 子模块

| 文件 | 说明 |
|------|------|
| `ob/mqtt.ts` | MQTT 连接与订阅同步 |
| `ob/helpers.ts` | Token、timer、logo |
| `ob/http.ts` | 采集 HTTP 封装 |
