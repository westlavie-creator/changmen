# scripts/sync/

本机 `server/backend/.env` 片段 → VPS `.env` 的同步入口（**不**跑完整 deploy）。

VPS 端合并逻辑在 [`deploy/scripts/`](../../deploy/scripts/)（`sync-*-remote.sh`）。

| 脚本 | 命令 | 同步内容 |
|------|------|----------|
| `sync-telegram-env.mjs` | `node scripts/sync/sync-telegram-env.mjs` | `TELEGRAM_BOT_TOKEN`、`TELEGRAM_ADMIN_CHAT_ID` |
| `sync-poly-builder-env.mjs` | `node scripts/sync/sync-poly-builder-env.mjs` | `POLY_BUILDER_*`（香港 + 上海） |
| `read-telegram-token.mjs` | `node scripts/sync/read-telegram-token.mjs` | 从本机 `.env` 读出 token（stdout，无 echo） |
| `sync-telegram-env.ps1` | PowerShell 包装，委托上述 `.mjs` | 同 Telegram |

Windows 快捷：`BAT\sync-telegram-env.bat`（本地 gitignore）。

部署相关 key 同步（Predict.fun 等）在 [`scripts/deploy/`](../deploy/README.md)，不在此目录。
