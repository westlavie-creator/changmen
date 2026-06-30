# XBet

| 目录 | 用途 |
|------|------|
| 根目录 `collect.ts` 等 | **浏览器采集**（A8 Socket.IO `XBet` 赔率；地图小分由 MatchCard `pm_sport` 展示，不再订阅 `XBet:Score`） |
| `devtools/platform-probes/xbet/` | 可选 Node 探针 CLI |

生产代码在平台根目录，不在 `frontend/`。

详见 `devtools/platform-probes/xbet/docs/README.md`。
