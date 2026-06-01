# IA 采集

## 入口

`ia/index.ts` → `startIaCollector()`

## 双通道

| 通道 | 间隔 | 作用 |
|------|------|------|
| HTTP 列表 + 详情 | 30s | `saveMatch` / `saveBets` |
| Socket.IO `DEFAULT_IA_WS` path `/esport/ws/IA` | 实时 | 锁盘、赔率点更新 |

WS 连接后 `emit("RoomJoin", { room_type: "room_type_index_content_push" })`。

## 消息类型（WS）

| `message_type` | 处理 |
|----------------|------|
| `message_type_bet_item_single_lock` | `odds.updateBetLock` |
| `message_type_push_point_change` | 按 `point_id` 更新赔率 |

## 盘口命名

`betKeyFromChild`：`[地图N]` 或 `[全场]` + 子玩法名。

## 开赛时间

`parseStartTime`：支持秒/毫秒/ISO；缺失时 fallback `Date.now()`（与 OB 不同，后续可对齐 A8）。

## HTTP

`ia/http.ts` — `collectIaGet` / `collectIaPost`。

## 后端对照

`gamebet_backend/platforms/ia/ia_ws.js` — WS 入口配置。
