# changmen 文档索引

日常开发从 [readme.md](../readme.md)（摘要）与 [CLAUDE.md](../CLAUDE.md)（命令与细节）入手；本页汇总专题文档。

## 文档地图

| 类型 | 位置 | 例子 |
|------|------|------|
| 架构 / 运维 / 多运动 / catalog | `docs/` | 本文、`ARCHITECTURE.md`、`CATALOG.md` |
| 前端实现 | `client/web/src/ARCHITECTURE.md` | stores、采集链路、数据流 |
| A8 对齐（parity） | `client/web/docs/` | `A8_PARITY_REGISTRY.md` |
| 平台探针 | `devtools/platform-probes/{id}/docs/` | OB 状态映射、RAY 对照 |
| 产品线锚点 | `lines/` | `line.json`、esport/baseball |
| 共享包 | `packages/` | `shared`、`api-contract`、`client-core` |
| 历史笔记 | `docs/archive/` | 已结案排查记录 |

## 架构与部署

| 文档 | 内容 |
|------|------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Monorepo 结构、`client/*` / `server/*` / `packages/*`、数据流、**本地开发端口** |
| [ARB_MULTI_SPORT.md](./ARB_MULTI_SPORT.md) | **多运动维护态**：棒/足 Tab + PM∥PF + N3 moneyline 合并；不开 N4；电竞主线见 `client/web/docs/A8_NEXT_STEPS.md` |
| [SPORTS_PRODUCT_LINES.md](./SPORTS_PRODUCT_LINES.md) | monorepo 目录 / `lines/` manifest / 脚本落点（服从 ARB_MULTI_SPORT） |
| [CATALOG.md](./CATALOG.md) | `sport` / `game` / `market` catalog 字段与扩展规则（**配置单一入口**） |
| [../server/README.md](../server/README.md) | **服务端包索引**、进程图、常用命令 |
| [DATA_STORAGE.md](./DATA_STORAGE.md) | 云库 vs 本机 JSON、迁移目录、快照生命周期与 archive |
| [TEAM_BOUNDARIES.md](./TEAM_BOUNDARIES.md) | 客户端 / 服务端目录边界 |
| [PATH_REGISTRY.md](./PATH_REGISTRY.md) | **路径单点登记**（`CHANGMEN_LAYOUT`、消费方索引） |
| [../PRODUCTION_DEPLOYMENT.md](../PRODUCTION_DEPLOYMENT.md) | 生产拓扑、环境变量、PM2 |
| [../deploy/ecosystem.config.cjs](../deploy/ecosystem.config.cjs) | `changmen-esport` + `changmen-pm-sports` 进程清单 |

## 应用

| 路径 | 文档 |
|------|------|
| `server/` | [README.md](../server/README.md) — 包索引与进程图 |
| `server/backend` | [README.md](../server/backend/README.md) |
| `client/web` | [README.md](../client/web/README.md) · [MIGRATION.md](../client/web/MIGRATION.md) · [src/ARCHITECTURE.md](../client/web/src/ARCHITECTURE.md) |
| `server/db` | [README.md](../server/db/README.md) |
| `server/storage` | [README.md](../server/storage/README.md) |
| `server/match-engine` | [README.md](../server/match-engine/README.md) |
| `server/team-resolver` | [README.md](../server/team-resolver/README.md) |
| `server/matcher` | [README.md](../server/matcher/README.md) |
| `server/realtime-hub` | [README.md](../server/realtime-hub/README.md) |
| `chrome-extension` | [README.md](../chrome-extension/README.md) · `npm run chromeplug:pack` |
| `client/venue-adapter` | [README.md](../client/venue-adapter/README.md) |
| `packages/` | [README.md](../packages/README.md) — `shared` · `api-contract` · `client-core` |

## 客户端 / Parity

| 文档 | 内容 |
|------|------|
| [../client/web/docs/README.md](../client/web/docs/README.md) | A8 parity 文档集索引 |
| [../client/web/docs/A8_PARITY_REGISTRY.md](../client/web/docs/A8_PARITY_REGISTRY.md) | 对齐总览 |

## 运维脚本

见 [scripts/README.md](../scripts/README.md)（`changmen/scripts/` + `server/backend/scripts/` 索引）。

Windows 启动：[BAT/README.md](../../BAT/README.md)（在**本仓库根**执行；`BAT\` 本地 gitignore，见 [LOCAL_DEV.md](../LOCAL_DEV.md)）。
