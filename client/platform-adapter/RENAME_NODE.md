# 目录命名说明

| 时期 | 路径 | npm 包名 |
|------|------|----------|
| 旧 | `platform-adapter/node/{platform}/` | — |
| 曾用 | `devtools/platform-probes/` | `@changmen/platform-probes` |
| **现** | **`devtools/platform-probes/`** | **`@changmen/platform-probes`** |

`platform-probes` = 可选探针/CLI，非浏览器采集主链路。瘦包同步目标目录仍为 `server/backend/platform_node`（部署兼容）。

OB 锁盘观察：`client/platform-adapter/ob/shared/lock_decision.ts` + `npm run ob:lock-observe`。

瘦包：`npm run sync:platform-adapter` 同步 `platform_adapter` + `platform_node` 两个目录。
