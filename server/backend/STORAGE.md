# storage/ — 本机 JSON 运行时目录

路径默认 `server/backend/storage/`，由 `@changmen/db/paths` 解析：

- `GAMEBET_STORAGE_DIR` — 覆盖整个 storage 根
- `ESPORT_DATA_DIR` — 覆盖 JSON 数据目录（默认同 storage）

**本目录已 gitignore**，勿提交凭证。首次启动由 `ensureStorageSeed()` 从 `platforms.example.json` 生成缺失文件。

## 文件说明

| 文件 | 用途 | 写入方 |
|------|------|--------|
| `platforms.json` | 各平台 gateway/token（采集凭证） | `platform_sync`、`setPlatform`、运维脚本 |
| `tag_platforms.json` | 信用盘标签平台目录 | `account_store` |
| `players.json` | 信用盘 player 余额/归属 | `account_store` |
| `player_orders.json` | 各 player 订单缓存 | `account_store` |
| `default_odds.json` | 初赔快照（只增不改，5s 防抖写盘） | `default_odds` API |
| `*.b64` | 平台会话缓存（如 PB） | platform-probes 脚本 |

## 不在 storage 的数据

| 数据 | 实际位置 |
|------|----------|
| 比赛/赔率/合并列表 | RDS `platform_*` / `client_matches` |
| 充提流水 `money_logs` | RDS `money_logs` 表（非 `money_logs.json`） |
| 用户账号/CollectConfig | RDS `profiles`（`ACCOUNT` 等 jsonb） |

## 新环境

1. `BAT\setup-dev-env.bat` — 创建 `.env`
2. 首次 `npm run web` — 自动 seed `storage/*.json`
3. 编辑 `storage/platforms.json` 填入各平台 token（或从 VPS 复制）

模板参考：`storage.example/`、`platforms.example.json`。
