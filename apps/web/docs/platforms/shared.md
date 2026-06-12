# 共享采集工具

## collectSession.ts

`resolveCollectSession(provider, opts)` — 为 **PB / IMT / SABA** 等需要登录态 HTTP 的平台解析：

1. 优先 `accountStore` 中已登录且带 `gateway` + `token` 的账号（可选要求有余额）
2. 回退 `Client_GetCollectPlatform` 的 `platforms.json` 凭证

## collectNotify.ts

`notifyCollectError(platform, err)` — 采集循环异常时统一告警（避免各平台重复实现）。

## a8MatchTime（前端）

路径：[`utils/a8MatchTime.ts`](../../utils/a8MatchTime.ts)

| 导出 | 含义 |
|------|------|
| `A8_MATCH_MAX_FUTURE_MS` | 3600s，开赛不得超过「现在 +1h」 |
| `IM_ODDS_ACTIVE_MS` | 3h，IM 无 Socket 推送则不再输出 |
| `normalizeEpochMs` | 秒/毫秒时间戳归一 |
| `a8StartTimeCollectAllowed` | 采集侧是否允许该开赛时间 |

后端镜像：`packages/shared/time/match_time.mjs`。

## 游戏目录

各平台 `SourceGameID` 含义不同，统一见 `packages/shared/catalog/game_catalog.json` 与 `getGameCodeForPlatformId` / `getPlatformGameId`。

采集侧通过 `getGames(platform)` 只拉取配置中启用的游戏 ID 列表。
