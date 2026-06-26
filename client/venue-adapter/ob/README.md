# OB

| 目录 | 用途 |
|------|------|
| 根目录 `collect.ts` / `bet.ts` / `mqtt.ts` 等 | **浏览器采集与下注**（主链路） |
| `shared/` | 浏览器 HTTP / SaveBet / 锁盘决策（`collect.ts`、`markets.ts` 共用） |
| `devtools/platform-probes/ob/` | 可选 Node 探针 CLI |

生产代码在平台根目录，不在 `frontend/`。

```bat
cd changmen/devtools/platform-probes
npm run ob:view -- --match <match_id>
```

详见 `devtools/platform-probes/ob/docs/`。
