# @changmen/db

PostgreSQL / RDS **数据层唯一入口**。业务代码只 `import` 本包，不直连 `rds/*_store.js`。

## 使用方

| 包 | 典型用途 |
|----|----------|
| `server/backend` | `Client_*` / `API_*` 读写 orders、profiles、platform_* |
| `server/matcher` | `client_matches` 合并写入 |
| `server/collectors/*` | `writePlatformMatches`、PM sport 列 |
| `server/value-bet` | 订单与赔率查询 |
| 运维脚本 | `ensurePgPoolReady`、`getPgPool` |

## 目录

| 路径 | 内容 |
|------|------|
| `index.js` | 对外 API（re-export impl + 工具） |
| `impl_rds.js` | RDS facade |
| `rds/*_store.js` | 分表 store（orders、auth、client_matches、platform_*…） |
| `pg_pool.js` / `resolve_database_url.js` | 连接池与 URL 解析 |
| `order_link_filter.js` | LinkID / 套利链过滤 |
| `../backend/db/migrations/` | SQL 迁移（**不在本包内**；`npm run db:apply` 应用） |

## 环境变量

`DATABASE_URL` 或 `DATABASE_URL_PUBLIC` / `DATABASE_URL_INTERNAL`（见 `server/backend/.env`）。

本地 JSON / esport 凭证路径见 [`@changmen/storage`](../storage/README.md)，非本包职责。

相关：[server/README.md](../README.md) · [docs/DATA_STORAGE.md](../../docs/DATA_STORAGE.md)
