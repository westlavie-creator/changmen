# server/backend/scripts

后端运维与启动脚本。`npm run` 入口见 `server/backend/package.json`。

## 目录

| 路径 | 用途 |
|------|------|
| **根目录** | 启动与日常 CLI：`web`、`db:apply`、`account:*`、`check:collect` 等 |
| [`ops/incidents/`](ops/incidents/) | 一次性事故修复：`cleanup-*`、`purge-*`、`fix-*`、`migrate-gb*` |
| [`ops/diagnostics/`](ops/diagnostics/) | 排障、deploy 自检、`check:rds-schema` |
| [`ops/migrations/`](ops/migrations/) | `db:migrate-*`、归档兜底、`poly:backfill-settlement` |
| [`archive/`](archive/) | 已归档 `_tmp` / 一次性脚本 |
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
| `ensure-router-compiled.mjs` | `compile:router`（preweb 链） |
| `test-packaged-adapter-layout.js` | `npm run test:adapter` |

完整列表以 `package.json` `scripts` 段为准。

## 约定

- **新临时脚本**：直接放进 `archive/`，文件名仍可用 `_` 前缀；**不要**堆在根目录。
- **事故修复**：完成后迁入 `ops/incidents/`，根目录只留可复用的运维入口。
- **运行**：在 `server/backend` 下 `node scripts/<path>`，或 `node scripts/ops/incidents/<name>.mjs`。

仓级脚本索引：[scripts/README.md](../../../scripts/README.md)
