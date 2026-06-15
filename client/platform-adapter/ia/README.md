# IA

| 目录 | 用途 |
|------|------|
| 根目录 `collect.ts` / `bet.ts` / `realtime.ts` 等 | **浏览器采集与下注**（主链路，HTTP + Socket.IO） |
| `shared/` | SaveBet / 字段解析，与 `platform-probes` 共用 |
| `devtools/platform-probes/ia/` | 可选 Node 探针 CLI |

生产代码在平台根目录，不在 `frontend/`。

```bat
cd changmen/devtools/platform-probes
npm run ia:events
```

详见 `devtools/platform-probes/ia/docs/README.md`。
