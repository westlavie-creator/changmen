# IMT

| 目录 | 用途 |
|------|------|
| 根目录 `collect.ts` / `bet.ts` / `parse.ts` 等 | **浏览器采集与下注**（主链路，HTTP 列表 + delta 推送） |
| `devtools/platform-probes/imt/` | 可选 Node 探针 CLI |

生产代码在平台根目录，不在 `frontend/`。

```bat
cd changmen/devtools/platform-probes
npm run imt:events
```

详见 `devtools/platform-probes/imt/docs/README.md`。
