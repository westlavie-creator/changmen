# changmen 文档索引

日常开发从 [readme.md](../readme.md) 与 [CLAUDE.md](../CLAUDE.md) 入手；本页汇总专题文档。

## 架构与部署

| 文档 | 内容 |
|------|------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Monorepo 结构、`client/*` / `server/*` / `packages/*`、数据流 |
| [DATA_STORAGE.md](./DATA_STORAGE.md) | 云库 vs 本机 JSON、迁移目录、prune |
| [TEAM_BOUNDARIES.md](./TEAM_BOUNDARIES.md) | 客户端 / 服务端目录边界 |
| [../PRODUCTION_DEPLOYMENT.md](../PRODUCTION_DEPLOYMENT.md) | 生产拓扑、环境变量、PM2 |
| [../ecosystem.config.cjs](../ecosystem.config.cjs) | `gamebet-web` + `gamebet-matcher` 进程清单 |

## 应用

| 路径 | 文档 |
|------|------|
| `server/backend` | [README.md](../server/backend/README.md) · [GAMES.md](../server/backend/GAMES.md) · [MARKETS.md](../server/backend/MARKETS.md) |
| `client/web` | [README.md](../client/web/README.md) · [MIGRATION.md](../client/web/MIGRATION.md) |
| `server/matcher` | [README.md](../server/matcher/README.md) |
| `client/chrome-extension` | [README.md](../client/chrome-extension/README.md) · `npm run chromeplug:pack` |
| `client/platform-adapter` | [README.md](../client/platform-adapter/README.md) |

## 运维脚本

见 [scripts/README.md](../scripts/README.md)（`changmen/scripts/` + `server/backend/scripts/` 索引）。

Windows 启动：[BAT/README.md](../BAT/README.md)。
