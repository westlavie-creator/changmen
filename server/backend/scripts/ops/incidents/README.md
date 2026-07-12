# ops/incidents/

一次性生产事故修复脚本（按用户/订单/账号去重、迁移、手工 fix 等）。

运行示例（在 `server/backend`）：

```bash
node scripts/ops/incidents/cleanup-gb13-ob-dupes-by-primary.mjs
```

执行前确认 RDS 备份与环境；多数脚本为历史 incident 专用。
