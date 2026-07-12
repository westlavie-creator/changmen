# server/backend/scripts

后端运维与启动脚本。`npm run` 入口见 `server/backend/package.json`。

## 目录

| 路径 | 用途 |
|------|------|
| **根目录** | 常驻脚本：`web` 启动、RDS 迁移、账号 CLI、采集审计、`probe:hk-relay` 等 |
| [`ops/incidents/`](ops/incidents/) | 一次性事故修复：`cleanup-*`、`purge-*`、`fix-*`、`migrate-gb*` |
| [`ops/diagnostics/`](ops/diagnostics/) | 排障：`diag-*`、`mem_diag_*` |
| [`ops/migrations/`](ops/migrations/) | 非 package.json 的数据回填 / 审计迁移 |
| [`archive/`](archive/) | 已归档的 `_tmp` / `_diag` / `_probe` 临时脚本（勿新增同类到根目录） |
| [`lib/`](lib/) | 脚本共用模块（如 `pb_auth.mjs`） |

## 根目录脚本（与 package.json 对齐）

| 脚本 | npm 命令 |
|------|----------|
| `start-db.mjs` | `npm run web` |
| `start-rds.mjs` | `npm run web:rds` |
| `preweb.js` | `preweb` |
| `apply-rds-schema.mjs` | `npm run db:apply` |
| `account_cli.js` | `npm run account:*` |
| `create-user.js` | `npm run user:create` |
| `check-collect-platforms.js` | `npm run check:collect` |
| `probe-hk-relay.mjs` | `npm run probe:hk-relay` |
| `archive-stale-client-matches.mjs` | `npm run db:archive-stale` |
| `post-deploy-check.mjs` | `npm run post-deploy:check` |

完整列表以 `package.json` `scripts` 段为准。

## 约定

- **新临时脚本**：直接放进 `archive/`，文件名仍可用 `_` 前缀；**不要**堆在根目录。
- **事故修复**：完成后迁入 `ops/incidents/`，根目录只留可复用的运维入口。
- **运行**：在 `server/backend` 下 `node scripts/<path>`，或 `node scripts/ops/incidents/<name>.mjs`。

仓级脚本索引：[scripts/README.md](../../../scripts/README.md)
