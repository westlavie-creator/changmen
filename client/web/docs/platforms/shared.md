# 共享采集工具

源码在 **`client/venue-adapter/shared/`**（Vite `@venue/shared/...`），不在 `client/web/src/`。

## collectSession.ts

`resolveCollectSession(provider, opts)` — 为 **PB / IMT / SABA** 等需要登录态 HTTP 的平台解析：

1. 优先 `accountStore` 中已登录且带 `gateway` + `token` 的账号（可选要求有余额）
2. 回退 `Client_GetCollectPlatform` 的 `platforms.json` 凭证

## collectNotify.ts

`notifyCollectError(platform, err)` — 采集循环异常时统一告警（避免各平台重复实现）。

## a8MatchTime（前端）

路径：[`shared/a8MatchTime.ts`](../../src/shared/a8MatchTime.ts)

| 导出 | 含义 |
|------|------|
| `A8_MATCH_MAX_FUTURE_MS` | 3600s，开赛不得超过「现在 +1h」 |
| `IM_ODDS_ACTIVE_MS` | 3h，IM 无 Socket 推送则不再输出 |
| `normalizeEpochMs` | 秒/毫秒时间戳归一 |
| `a8StartTimeCollectAllowed` | **[A8 可证实]** 采集侧是否允许该开赛时间（仅未来 1h 上限，**无过去下限**） |

后端镜像：`packages/shared/time/match_time.ts`。

### Polymarket 采集窗 [changmen 扩展]

A8 无 Polymarket。PM 不用 `a8StartTimeCollectAllowed`，单独 **过去 6h、未来 1h**：

- **VPS 写库（当前）**：`changmen-polymarket-collector` 写 `platform_*` + `polymarket_market_index.json`；浏览器**不**再 Gamma/`Save*`，只 `GetCollectPlatform.MarketIndex` → Market WS → `fo`
- **切流后**：VPS 独占写库；浏览器改为 MarketIndex → WS→fo
- 关 VPS 写库：`POLYMARKET_COLLECTOR_WRITE_PLATFORM=0`
- 常量对齐：`venue-adapter/polymarket/api.ts` 与 collector `api.js`
- 赛程状态另见：`server/collectors/polymarket-sports`（`pm_sport`）

## 游戏目录

各平台 `SourceGameID` 含义不同，统一见 `packages/shared/catalog/game_catalog.json` 与 `getGameCodeForPlatformId` / `getPlatformGameId`。

采集侧通过前端静态 `venueGames` 列表过滤启用的游戏 ID，避免主采集链路反复请求 `Client_GetGames`。
