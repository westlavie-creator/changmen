# changmen 文档索引

日常开发从 [readme.md](../readme.md) 与 [CLAUDE.md](../CLAUDE.md) 入手；本页汇总专题文档。

## 架构与部署

| 文档 | 内容 |
|------|------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Monorepo 结构、`apps/*` / `packages/*`、数据流 |
| [DATA_STORAGE.md](./DATA_STORAGE.md) | 云库 vs 本机 JSON、迁移目录、prune |
| [../PRODUCTION_DEPLOYMENT.md](../PRODUCTION_DEPLOYMENT.md) | 生产拓扑、环境变量、PM2 |
| [../ecosystem.config.cjs](../ecosystem.config.cjs) | `gamebet-web` + `gamebet-matcher` 进程清单 |

## 应用

| 路径 | 文档 |
|------|------|
| `apps/backend` | [README.md](../apps/backend/README.md) · [GAMES.md](../apps/backend/GAMES.md) · [MARKETS.md](../apps/backend/MARKETS.md) · [proxy/README.md](../apps/backend/proxy/README.md) |
| `apps/web` | [README.md](../apps/web/README.md) · [MIGRATION.md](../apps/web/MIGRATION.md) |
| `apps/matcher` | [README.md](../apps/matcher/README.md) — 循环 vs UI vs `/matcher` 桥接 |
| `apps/chrome-extension` | [README.md](../apps/chrome-extension/README.md) · `npm run chromeplug:pack` |
| `packages/platform-adapter` | [README.md](../packages/platform-adapter/README.md) |

## 运维脚本

见 [scripts/README.md](../scripts/README.md)（`changmen/scripts/` + `apps/backend/scripts/` 索引）。

Windows 启动：[BAT/README.md](../BAT/README.md)。
