# PB part888 `sports-websocket` 协议冻结（Step0）

> `[changmen 扩展]` — bundle `esthardsk/static/js/main.5c748fd7.js` + 已登录会话实抓（2026-08-16）。  
> **价格行 `G` 已实抓验证**（见 §8）；与 changmen `euro/odds` HTTP 对拍仍待采集会话。旁路不得停 HTTP。

## 1. 连接

| 项 | 值 |
|----|------|
| 基址 | `wss://{hostname}/sports-websocket/ws`（bundle：`getWebSocketURL()` → `wss://` + `window.location.hostname` + `/sports-websocket/ws`） |
| 鉴权模式 | `window.env.headerBasedEnabled` 为真时拼 query（part888 线上即此形态） |
| Query | `?token={wsToken}&ulp={_ulp}`；可选调试：`timeoutHandshake` / `delayConnectedMsg` / `blockPing` |

```text
url = getWebSocketURL() + "?token=" + wsToken + "&ulp=" + xAppData._ulp
```

| 参数 | 来源 | 说明 |
|------|------|------|
| `token` | `GET {memberAuthOrService}/swstoken` → `data.token` | part888 常为 `member-auth/v2/swstoken`（`env.enableUseMemberAuthEndpoints`）；否则 `member-service/v2/swstoken` |
| `ulp` | `x-app-data` JSON 内 `_ulp` | URL 编码；解码为 `{blob}\|{hex}` |
| Cookie | 同源 Upgrade 带 part888 Cookie | **扩展 content script 同页建连** |

## 2. 帧类型

bundle 枚举 `_56`：

| `type` | 方向 | 处理摘要 |
|-------|------|----------|
| `PING` | S→C | 回 `PONG`（`destination: ALL`）；刷新超时 |
| `PONG` | C→S | 应答 |
| `CONNECTED` | S→C | 读 `vssid`；清重连间隔；触发订阅 |
| `SUBSCRIBE` / `UNSUBSCRIBE` | C→S | 订阅 / 取消 |
| `RESET_CONNECTION` | S→C | `currentTarget.close()` 后置重连 |
| `WEBSOCKET_DISABLED` | S→C | `disconnectWebSocket` → HTTP 降级（`useHttpRequest`） |
| `LIVE_SCORE_NOTIFIER_DISABLED` | S→C | 枚举有 |

业务盘口不在上表：走 default → `onMessage`，实抓为 `UPDATE_ODDS`（另有 `FULL_ODDS` 枚举，本轮未录到）。

### 2.1 `CONNECTED`（bundle 冻结）

handler（`case CONNECTED`）只读：

```json
{ "type": "CONNECTED", "vssid": "<string>" }
```

其它字段若存在可忽略。实抓未录到首帧（中途挂接）；以 bundle `l.get(r,"vssid","")` 为准。

## 3. Destination

| `destination` | 用途 |
|----------------|------|
| `ODDS` | 主盘口 |
| `SPECIAL_ODDS` / `TOURNAMENT_ODDS` / `FAVOURITE_EVENTS` | 特殊 / 锦标赛 / 收藏 |
| `LIVE_SCORE` | 比分 |
| `LEFT_MENU` | 左侧菜单 |
| `CAROUSEL` | 轮播/轮播条（电竞页实抓有 `SUBSCRIBE`；可选） |
| `ALL` | 广播（PONG） |

对 `ODDS` / `SPECIAL_ODDS` / `FAVOURITE_EVENTS` / `TOURNAMENT_ODDS` 订阅时生成 UUID 写入 `id`。

## 4. `SUBSCRIBE ODDS`（实抓）

```json
{ "type": "UNSUBSCRIBE", "destination": "ODDS" }
```

电竞页（`g` / `dpQOr` 打码）：

```json
{
  "type": "SUBSCRIBE",
  "destination": "ODDS",
  "id": "<uuid>",
  "body": {
    "sp": 12,
    "lg": "",
    "ev": "",
    "mk": 1,
    "btg": "1",
    "ot": 1,
    "d": "",
    "o": 1,
    "l": 3,
    "v": "<cursorMs>",
    "lv": "<liveCursorMs>",
    "me": 0,
    "more": false,
    "lang": "",
    "tm": 0,
    "pa": 0,
    "c": "",
    "g": "<REDACTED>",
    "pn": -1,
    "ec": "",
    "cl": 3,
    "hle": false,
    "pimo": "",
    "inl": false,
    "pv": 1,
    "ic": false,
    "ice": false,
    "me01": "",
    "ru": "",
    "dpQOr": "<REDACTED>",
    "locale": "zh_CN"
  }
}
```

| 字段 | 含义 |
|------|------|
| `sp` | sportId；电竞 `12` |
| `v` / `lv` | 游标毫秒串 |
| `g` / `dpQOr` | 会话动态参数；**勿入库/勿进明文文档** |
| `lg` / `ev` | 联赛/赛事过滤；列表页为空 |

SPA **体育 ↔ 电子竞技** 切换会再发 `SUBSCRIBE|ODDS`（同 WS 不断开）。

### 4.1 compact 列表 Tab ↔ `mk`（实抓 + bundle 可证实，2026-08-16）

官网电竞 compact 顶栏三个 `div.market-tab`（`live-tab` / `nolive-tab`），切换时打：

`GET /sports-service/sv/compact/events?...`

**`mk` = market（盘口时段/市场页）枚举**，不是无关差参。bundle `main.5c748fd7.js`：

```text
{ Early:0, Today:1, Live:2, ALL:3, Parlay:4, Outright:5, CorrectScore:6, … }
```

（同文件里以 `_61` 引用；请求拼装可见 `mk:c._61.Live` / `mk:c._61.ALL` 等。）

| Tab（UI） | DOM class | **`mk`** | 枚举名 |
|-----------|-----------|----------|--------|
| 早盘 | `nolive-tab` | **0** | `Early` |
| 今天 | `nolive-tab` | **1** | `Today` |
| 滚球盘 | `live-tab` | **2** | `Live` |

**今天 vs 早盘（为何早盘多很多）— 实锤结论（2026-08-16 电竞 `sp=12` 对照）**

抓包时刻：上海 **08-16 10:30**，Curacao **08-15 22:30**（跨日窗口，可区分时区）。

| 断言 | 结果 |
|------|------|
| compact 事件开赛时间下标 | **`ev[4]` 为 epoch ms**（bundle `Q.time=3` **不适用于** compact 树） |
| `live` / `isToday` | 模板可证实：`ev[5]` / `ev[6]` |
| 「今天」非滚球主盘开赛日 | **全部落在 America/Curacao 的日历「今天」** |
| 「今天」是否=上海今天 | **否**：有 **28** 场开赛日=上海今天、但 Curacao=明天 → 全部在 **早盘**，**不在今天**（与今天 id 交集 **0**） |
| 「早盘」是否=用户时区今天 | **否**：早盘是 **Curacao 今天之后** 的赛前池（本样本 Cur 日 `08-16`～`08-17`），默认可跨多日 |
| 「今天」可否含滚球 | **可**：`mk=1` 响应可含 `live=1`；UI 还有 `liveContainerOnTop` |

业务常量（bundle）：`DEFAULT_TIME_ZONE="GMT-04:00"`，`SERVER_TIME_ZONE_ID="America/Curacao"`。

**一句话**：今天 / 早盘按 **固定业务日（Curacao / GMT-04）** 切「当日赛前 vs 更晚赛前」；不是「今天用固定时区、早盘用你时区」。你本地「今天下午」的场，若已是 Curacao 的明天，会出现在 **早盘**。


## 5. 与 euro/odds HTTP 的关系

| | HTTP `euro/odds` | sports-websocket |
|--|------------------|------------------|
| changmen 现状 | **主路径** | **未接入** |
| 主键 | `event.id`、`lineId`、`periods` | 同 `eventId`/`lineId`（压缩数组） |
| `rotNum` | SaveMatch 已落库 | 在事件数组下标 `25`（见 §7.3）；增量价格行本身不带。观测侧栏从 `odds.l` 树读取并展示 |
| 降级 | — | `WEBSOCKET_DISABLED` → HTTP |

**结论：** WS = 增量；HTTP 全量仍必要。旁路不得停轮询。

**[changmen 扩展] 采集调度：** 默认 **A8**（`mHe`：仅 live 写 `fo`，不采 prematch）。用户中心「PB changmen 扩展」开：live / prematch 双 5s、两侧写 `fo`。影子旁显 `pbWsShadowUi` 仅扩展模式下可用。

**[changmen 扩展] 影子旁显：** 用户中心「扩展」`pbWsShadowUi`。**目标：主价/fo 不动；影子必须等于官网同一格。**

官网源（**禁止 hook 另拉 euro**，**不做 DOM 读格**）：

1. **WS** 页面已有 `sports-websocket` 的 `UPDATE_ODDS` / `FULL_ODDS`  
   - `odds.l` 事件树独赢：`event[8][period][0]` = 1x2 行（`_18.periods=8`，`lt.marketLine1x2=0`；`_64` away=0 / home=1）。有展示价才写。  
   - `odds.u` 增量：`action===0`、`betType=1`、`alt≠1`、**`hdp` 为 0/null**、truthy `oddFm` 才改；空不擦  
2. **HTTP** 拦截 SPA 自己的 `/sports-service/sv/euro/odds`（fetch/XHR 响应体）→ 有展示价才按 `eventId|period|主客` 补丁覆盖；空价不擦。页内请求可能带过滤，**不按缺 period 删卡**。观测 `start` **不清板**（SPA 首包 euro 早于 start）。

合并：**后到覆盖先到**。影子表 = 该合并结果镜像。采集 `euro/odds`（写 fo）与 SPA 不是同一趟请求。主站 `pbWsObserveGet` **优先问标签页内存板**，避免 `chrome.storage` 把过期快照盖上来。

对应键：`eventId|period|side`（主站 `selectionId` / `HomeID`）。无官网源则**不显示**旁显。须开 Chrome「PB WebSocket 观测」。

## 6. changmen 接入约束（Step1 起）

1. 仅在 **part888 同源标签 content script** 建连。  
2. 默认观测：只转发原始帧，**不写** `oddsStore` / SaveMatch。  
3. 禁止把 token/ulp/`g` 明文写进仓库。

## 7. 业务推送与字段映射（已冻结）

### 7.1 `UPDATE_ODDS` 外壳（实抓）

```json
{
  "ssn": 90,
  "time": 1786837386343,
  "type": "UPDATE_ODDS",
  "destination": "ODDS",
  "odds": {
    "live": true,
    "refreshAll": false,
    "u": [[12, [ /* price/clock rows */ ]]],
    "l": [[12, "E Sports", [ /* league/event trees */ ]]]
  }
}
```

`odds.u` 元素按 bundle `X`：`[sportId, updateRows, version?, running?]`。电竞 `sportId=12`；同连接也可能推足球 `29`。

### 7.2 价格行 ↔ euro/odds（bundle 下标表 `G`）

`[A8/官网可证实]` bundle 表 `G`（`sports-websocket` 价格增量行，长度 13）：

```text
periodNum=0, betType=1, selectionType=2, hdp=3,
odds=4, oddsFm=5, lineId=6, oldLineId=7, alt=8,
signal=9, status=10, action=11, eventId=12
```

官网 `checkOddsChangeWS` 用 **同一行** 的并行下标表 `updatedOddMap`（0–10 与 `G` 对齐，名称不同）：

```text
periodNum=0 … odd=4, oddFm=5, oddsid=6, oldOddsId=7,
isAltLine=8, upDownblinking=9, status=10
```

末两格约定（`[A8/官网可证实]`）：`row[length-2]` = `action`，`row[length-1]` = `eventId`。  
动作枚举 `Ma`：`ODDS=0`，`EVENT_STATUS=8`，`TIME=9`，`SCORE=10`，`PERIOD_STATUS=13`。  
**只有 `action===0` 才是价格行**；影子/侧栏不得把其它 action 当 ML。

配套枚举（bundle）：

| 表 | 值 |
|----|-----|
| `Bt` | `MONEYLINE=1`, `HANDICAP=2`, `TOTAL=3` |
| `K` | `home=0`, `away=1`, `draw=2`（`team1/team2` 同 0/1） |
| `H`（行/场状态字母） | `O` / `I` / `H`（字面即 `"O"|"I"|"H"`） |

| WS 下标 | 字段 | 对照 euro/odds / 语义 | 证据级 |
|---------|------|----------------------|--------|
| 0 | `periodNum` | `periods` 的 key。电竞独赢：`0`=全场，`1…`=地图（与 `euro/odds?periodNum=0,1,…` 一致） | 可证实 + 实抓 period 键 |
| 1 | `betType` | `1`→`moneyLine`；`2` handicap；`3` total | `Bt` |
| 2 | `selectionType` | ML：`0` home / `1` away（`K`） | `K` + 实抓 |
| 3 | `hdp` | 让分/大小线；ML 常 `null` | 实抓 |
| 4 | `odds` | 美式价；关盘可为 `null` | 实抓 |
| 5 | `oddsFm` | 十进制串 → `homePrice`/`awayPrice`；**空/`null` = 无展示价（锁/关），观测不得丢行** | 实抓；官网 `shouldRenderOdds` 看非空 |
| 6 | `lineId` | = `updatedOddMap.oddsid` = HTTP `moneyLine.lineId` / 盘 `lineId` | 表对齐 + 换线实抓 |
| 7 | `oldLineId` | 换线前 line（= `oldOddsId`） | 换线实抓 |
| 8 | **`alt`** | **= `isAltLine`（0 主盘 / 1 附加线）**。官网 DOM 盘格 id 含 `isAltLine?1:0`；下注 `selectionId` 在 `altLineId>0` 时 `isAlt=1`。HTTP：`handicap[]`/`overUnder[]` 有 `isAlt`；**`moneyLine` 无 `isAlt` 字段**（采集样本 ml_isAlt=0） | 可证实 |
| 9 | `signal` | = `upDownblinking`；`>0` 涨闪 / 否则跌闪（`status!=="H"` 才闪） | `updateOdds` |
| 10 | `status` | 字母集 `H={O,I,H}`。实抓开盘价行为 `"O"`。`updateOdds` 在有 `oddFm` 时仍写格内数字；仅 `"H"` 时不闪。**`"I"` 是否可下注：未对拍** | O 实抓；I/H 锁语义待补 |
| 11 | `action` | 见上 `Ma`；价格须为 `0` | `Ma` / `checkOddsChangeWS` |
| 12 | `eventId` | **`event.id`**（fo / SaveBet / `Matchs.PB` 同键；**不是** `rotNum`） | 实抓 |

**`alt` 对影子映射的硬约束（勿再猜）：**

1. changmen HTTP `fo` / `selectionId(matchId,map,side)` 固定为  
   `eventId|period|1|homeBit|0|0|homeBit` → **第 5 段 `isAlt` 恒为 0**（只吃主盘 ML）。  
2. WS `alt===1` 与 HTTP `isAlt:true` 附加盘是同一类「非主线」；写入主盘 `oddId` 会盖错价。  
3. 旁显只收：`sportId=12` + `action=0` + `betType=1` + `period∈[0,10]` + **`alt≠1`** + `selectionType∈{0,1}`。  
4. 键必须是卡上的 **`eventId|period`**，禁止 `rotNum` 互拷到兄弟 event（live/pre 同 rot 不同 id）。

实抓价格行与上表一致，例如（脱敏结构）：

```text
[1, 1, 0, null, -244.0, "1.409", 3693358450, 3693358399, 0, -1, "O", 0, 1634080120]
 → period=1, betType=1(ML), home, oddsFm=1.409, alt=0, action=0, lineId=3693358450, eventId=1634080120
```

> §8.1 里出现的 period `40`/`41` 是事件树里**其它 period 键**（与全场/地图 `0…10` 不是同一槽）。影子板已用 `MATCH_MAP_PERIODS` 滤掉，勿映射进 fo 的 map。

### 7.3 其它行形态（bundle）

| 表 | 下标 | 用途 |
|----|------|------|
| `V` / `q` | `score/time/action/eventId` 或 `runningPeriod/runningTime/action/eventId` | 时钟行，如 `["1H","2'",9,eventId]` |
| `J` | sport 树 | `sportId, sportName, leagueEvents, …` |
| `$` | league | `id, name, events, …` |
| `Q` | event | bundle 写 `periods=6`；**实抓 compact 树 periods 在下标 8**（见 §8.2）。`rotNum` bundle 称下标 25 |

### 7.4 断线 / token / 重连（bundle）

库选项：`shouldReconnect: false`（不用库自带重连）；官网自管。

| 事件 | 行为 |
|------|------|
| `RESET_CONNECTION` | `close()` + 置重连 |
| `WEBSOCKET_DISABLED` | 断开并 `useHttpRequest` |
| 客户端主动关 | `close(1000, reasonCode)`（码 **1000**，reason 为下表） |
| `onClose` | 清状态；未在特殊门控时 `Tt()` + `kt()` 并可能 `setInterval` 重试 |
| 重取 token | `headerBasedEnabled` 时 `getWSToken()` → `GET …/swstoken`；**403 或空 token 则停**；成功写入 store 后再拼 URL |

超时 reason（`REASON_DISCONNECTED_WEBSOCKET`）：

| code | 含义 |
|------|------|
| `WSER01` | 1s 内未收到 CONNECTED |
| `WSER02` | WS 握手/状态 4xx/5xx |
| `WSER03` | 40s 无 PING |
| `WSER04` | 3s 连接超时 |

## 8. Step0 状态与正确性验证（2026-08-16，不刷新页）

### 8.1 已用实抓验证通过

对象：`eventId=1634080120`（Envy vs Sentinels，电竞 `sportId=12`）。

| 断言 | 结果 | 证据 |
|------|------|------|
| `G` 价格行长度 13，`eventId` 在下标 12 | **通过** | 多帧 `u` 行 `gOk` |
| `periodNum` ↔ 事件树 period key | **通过** | `u` 的 40/41 与 `l` 的 `"40"`/`"41"` |
| `selectionType` 0/1 = home/away | **通过** | 与 `l[period][2]=[homeOdds,awayOdds,…]` 对齐 |
| `lineId` / `oldLineId` | **通过** | `l` 快照 ML `lineId=3693374397`；约 10s 后 `u` 换线为 `3693374537`，**`oldLineId` 仍为 `3693374397`** |
| `oddsFm` 为十进制字符串 | **通过** | 如 `"1.934"`；换线后与旧 `l` 价不完全相等（预期漂移） |
| 事件 `id/home/away` | **通过** | `l` 树 `[1634080120,"Envy","Sentinels",…]` |

换线样例（period 41 ML）：

| | `l` 快照 | ~10s 后 `u` |
|--|----------|-------------|
| home `oddsFm` | `1.800` | `1.934`（已变） |
| away `oddsFm` | `1.943` | `1.813`（已变） |
| `lineId` | `3693374397` | `3693374537`（新线） |
| `oldLineId` | — | **`3693374397`（对齐旧线）** |

### 8.2 未验证 / 限制

| 项 | 状态 |
|----|------|
| 同秒 `euro/odds` HTTP ↔ `u` 行 | **未过**。本页 compact 主拉 `compact/events`；裸 `fetch euro/odds` 无官网头 → 400。changmen 采集头与官网 SPA 不同，需 Step1/采集会话再对 |
| `CONNECTED` 首帧 JSON | 未实录（仅 bundle `vssid`） |
| 人为断网 / `WSER*` | 未实操（仅 bundle） |
| 事件树 `periods` 下标 | 实抓在 **下标 8**（非 bundle `Q.periods=6`）。**价格行仍以 `G` 为准**；事件树下标勿照搬 `Q` |
| `G.status` 为 `I`/`H` 且仍有 `oddsFm` 时是否可下注 | **未过**（bundle 仅证实 `H` 不闪；观测暂把非 `O` 当锁，属推测） |

### 8.3 结论

- **盘口增量行 `G`：实抓验证通过**（可据此做观测解析 / 影子 fo 原型）。  
- **不等于**已与 changmen `euro/odds` 主路径对拍；那是下一步。  
- Step0 协议冻结可关闭；Step1 见下。

## 9. Step1 — 扩展观测（已落地，默认开）

代码：`chrome-extension/src/content/pb/` + background `pbWsObserve*`。

| 项 | 行为 |
|----|------|
| 触发页 | `*.part888.com` / `*.ps3838.com` **top frame** |
| 默认 | **开**（`pbWsObserveEnabled !== false`；未写入 storage 亦开） |
| 建连 | **挂接页面已有** sports-websocket（MAIN world hook）。不再自建第二条（双连会被踢 `close=1000`） |
| 订阅 | 沿用官网自己的 `SUBSCRIBE`；观测只听帧 |
| 转发 | 帧写入 `chrome.storage.local.pbWsObserve.recent`（最多 40；大帧截断） |
| 不写 | **不**写 `oddsStore` / SaveMatch / fo |

关闭：扩展弹窗取消勾选「PB WebSocket 观测」。重新开启：再勾选。

**录全 SUBSCRIBE**：先勾选 → 再刷新电竞页（扩展 **1.3.0+** 弹窗有订阅清单）。

### 9.1 实抓验收（2026-08-16）

| 项 | 结果 |
|----|------|
| `SUBSCRIBE` 发出 | `ODDS`、`LEFT_MENU`、`CAROUSEL` |
| 入站 | `ODDS` / `LEFT_MENU` / `ALL`（PING） |
| `UPDATE_ODDS` | 有（电竞盘口通道确认） |
| 可选 `LIVE_SCORE` 等 | 本页未订（正常） |

**Step1 关闭。** 下一步 Step2：影子写 fo（仍不停 HTTP）。
