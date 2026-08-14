# scripts/sync/

两类方向：

1. **本机 → VPS**：`.env` 片段同步（**不**跑完整 deploy）
2. **VPS → 本机**：开发用 MarketIndex 拉取（本机无 VPS collector）

VPS 端 `.env` 合并逻辑在 [`deploy/scripts/`](../../deploy/scripts/)（`sync-*-remote.sh`）。

| 脚本 | 命令 | 同步内容 |
|------|------|----------|
| `pull-vps-market-indexes.mjs` | `npm run sync:market-indexes` / `./sh/sync-market-indexes.sh` | VPS → 本机 `polymarket` / `predictfun` / `sxbet` MarketIndex（开发） |
| `sync-telegram-env.mjs` | `node scripts/sync/sync-telegram-env.mjs` | `TELEGRAM_BOT_TOKEN`、`TELEGRAM_ADMIN_CHAT_ID`（目标 202 生产机） |
| `sync-poly-builder-env.mjs` | `node scripts/sync/sync-poly-builder-env.mjs` | `POLY_BUILDER_*`（目标 202 生产机；原 166/上海已下线） |
| `sync-predictfun-key-remote.mjs` | `node scripts/sync/sync-predictfun-key-remote.mjs <host>` | `PREDICT_FUN_API_KEY` + `sync-hk-relay-env-remote.sh` + upstream 探针 |
| `read-telegram-token.mjs` | `node scripts/sync/read-telegram-token.mjs` | 从本机 `.env` 读出 token（stdout，无 echo） |
| `sync-telegram-env.ps1` | PowerShell 包装，委托上述 `.mjs` | 同 Telegram |

### MarketIndex（本机开发）

生产用户不需要：VPS collector 写同机文件，backend 直接读。本机开发没有 collector，PM-M 灰多半是本地 Index 过期。

```bash
# 拉一次
npm run sync:market-indexes
# 或
./sh/sync-market-indexes.sh

# 定时（默认 300s）
npm run sync:market-indexes -- --watch
./sh/sync-market-indexes.sh --watch --interval 180 --only polymarket
```

Windows 快捷：`BAT\sync-telegram-env.bat`（本地 gitignore）。

部署 tarball 入口见 [`scripts/deploy/`](../deploy/README.md)。
