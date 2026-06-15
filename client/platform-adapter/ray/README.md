# RAY（雷竞技 / ray164.com）

| 目录 | 用途 |
|------|------|
| 根目录 `collect.ts` / `bet.ts` / `realtime.ts` 等 | **浏览器采集与下注**（主链路，HTTP + WebSocket） |
| `shared/` | 浏览器 SaveBet / 赛段映射（`match_stage.ts`、`save_bets.ts`） |
| `devtools/platform-probes/ray/shared/` | 探针 CJS（`core.js`、CLI，与 `.ts` 逻辑对齐） |
| `devtools/platform-probes/ray/` | 可选 Node 探针 CLI |

生产代码在平台根目录，不在 `frontend/`。

官网：[https://ray164.com/](https://ray164.com/)

```bat
cd changmen/devtools/platform-probes
npm run ray:match
npm run ray:odds -- 38386601
npm run ray:ws
```

详见 `devtools/platform-probes/ray/docs/`。
