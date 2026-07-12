# ops/migrations/

数据回填与一次性迁移脚本。`npm run db:migrate-*` / `db:finalize-*` / `db:check-players` 入口见 `server/backend/package.json`。

## 脚本

| 脚本 | npm 命令 | 说明 |
|------|----------|------|
| `migrate-players-to-rds.mjs` | `db:migrate-players` | `storage/*.json` → RDS players |
| `migrate-players-owner-user-id.mjs` | `db:migrate-players-owner` | 回填 `owner_user_id`（027 前） |
| `finalize-players-owner-user-id.mjs` | `db:finalize-players-owner` | 收尾 orphan player（027 前必跑） |
| `migrate-accounts-jsonb-to-players.mjs` | `db:migrate-accounts-from-jsonb` | `profiles.accounts` → `players.account_data` |
| `check-players-rds-migrate.mjs` | `db:check-players` | 迁移后审计报告 |
| `migrate-order-hash-link-to-create-at.mjs` | — | 订单 hash 链补 `create_at`（`--execute` 执行） |

部署时自动触发顺序见 [`deploy/scripts/deploy-server-remote.sh`](../../../../../deploy/scripts/deploy-server-remote.sh)。

运维手册：[docs/ACCOUNT_BACKEND.md](../../../../../docs/ACCOUNT_BACKEND.md)
