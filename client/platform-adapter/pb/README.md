# PB

| 目录 | 用途 |
|------|------|
| 根目录 `collect.ts` / `bet.ts` / `transport.ts` 等 | **浏览器采集与下注**（主链路） |
| `shared/` | euro/odds 解析与 SaveBet，与 `platform-probes` 共用 |
| `devtools/platform-probes/pb/` | 可选 Node 探针 CLI |

生产代码在平台根目录，不在 `frontend/`。

```bat
cd changmen/devtools/platform-probes
npm run pb:odds
npm run pb:balance
```

详见 `devtools/platform-probes/pb/docs/README.md`。
