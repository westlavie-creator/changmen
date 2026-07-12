# ops/diagnostics/

排障与巡检：`diag-*`（账号、订单、pm_sport、merge）、`mem_diag_*`（内存）、`probe-hk-relay`（HK 出海 relay）、`polymarket-builder-trades`（Builder 成交对照）。

| 脚本 | npm 命令 |
|------|----------|
| `probe-hk-relay.mjs` | `npm run probe:hk-relay` |
| `polymarket-builder-trades.mjs` | `npm run poly:builder-trades` |

运行示例：

```bash
node scripts/ops/diagnostics/diag-river-accounts.mjs
node scripts/ops/diagnostics/mem_diag_report.mjs
npm run probe:hk-relay
```
