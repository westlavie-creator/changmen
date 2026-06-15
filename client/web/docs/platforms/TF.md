# TF 采集

对齐 A8 bundle **`UBe`**（`Xt.TF`）。完整 A8 行为、凭证、请求头、下注对照见 **[`A8_TF_LOGIC_PARITY.md`](./A8_TF_LOGIC_PARITY.md)**。

本项目在 A8 行为基础上增加 `saveMatch` / `saveBets` 落库。

## 入口

`tf/index.ts` → `startTfCollector()`

凭证：`getCollectPlatform("TF")` → 本地 `/esport/Client_GetCollectPlatform`（后端优先 `getTfA8CollectCredentials()` 从远程 A8 拉取）。

## 双通道

| 通道 | 间隔 | 作用 |
|------|------|------|
| HTTP `GET {Gateway}/api/v8/events/` | 30s | 列表 + 每场 MATCH/MAP 盘口 → `oddsStore` + `saveBets` |
| WebSocket `wss://47.115.75.57/esport/ws/TF?auth_token=…&combo=false` | 实时 | 仅更新已注册 `oddsStore` 的 `${marketId}:${name}`（须先 HTTP 拉过盘） |

浏览器 **直连** A8 代理 WS（`tf/ws.ts`，`auth_token` = 采集 Token 去 `Token ` 前缀）。不经 `/esport/ws/TF` 本地 relay / Electron IPC。

WS 重连：1s 起、×1.3 退避、上限 5s（等同 A8 `FBe`）；错误时 `notifyCollectError`。

## 列表过滤（A8）

- `game_id` ∈ `Client_GetGames` 返回的 `games`
- `a8StartTimeCollectAllowed(start_datetime)`：开赛 &lt; 现在 + 1 小时

Query 固定：`combo=false`、`outright=false`、`timing=today`、`market_option=MATCH`、`lang=zh`、`timezone=Asia/Shanghai`。

HTTP 头：见 [`A8_TF_LOGIC_PARITY.md` §2.1](./A8_TF_LOGIC_PARITY.md)（`$3` = Authorization + tf-authorization + public-token）。

## 盘口名

默认正则 `(独赢|获胜者)`（`market_catalog` / `TF_DEFAULT_BET_NAME`）。A8 实测 `BetName` 常为 `(独赢)`。平台配置可覆盖。

## 地图 Tab（A8 `a(eventId, tab)`）

1. 每场先 `wait(1s)`，再请求 `event_id` + `market_option=MATCH`
2. 从 MATCH 详情的 `results[].market_tabs` 发现非 `MATCH` 的 tab
3. 每个 tab：`wait(1s)` → `market_option=MAP` + `map_option=<tab 名>`

HTTP 详情：遍历匹配盘口下**全部** `selection` 写 `oddsStore`，锁定 `status !== "open"`。

## 下注（非采集）

`providers/tfProvider.ts`：预检/下单用 `ly` 头（无 `tf-authorization`）；订单用 `signed: true` 合并 `$3`。详见 parity 文档 §5。

## 子模块

| 文件 | 说明 |
|------|------|
| `tf/core.ts` | 开赛时间、盘口正则、tab/阶段、selection ID |
| `tf/http.ts` | REST + `$3` 头 |
| `tf/ws.ts` | 赔率 WS + 重连 |
| `tf/paths.ts` | 下单路径、港赔/欧赔 payload |
| `tf/auth.ts` | 再导出 `shared/platforms/tfAuth` |
