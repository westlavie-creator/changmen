# ops/diagnostics/

排障与巡检：`diag-*`、`mem_diag_*`、`probe-hk-relay`、`post-deploy-check`、`check-rds-schema`、`polymarket-builder-trades`。

| 脚本 | npm 命令 |
|------|----------|
| `probe-hk-relay.mjs` | `npm run probe:hk-relay` |
| `post-deploy-check.mjs` | `npm run post-deploy:check` |
| `check-rds-schema.mjs` | `npm run check:rds-schema` |
| `polymarket-builder-trades.mjs` | `npm run poly:builder-trades` |

运行示例：

```bash
node scripts/ops/diagnostics/diag-river-accounts.mjs
node scripts/ops/diagnostics/mem_diag_report.mjs
npm run probe:hk-relay
```
