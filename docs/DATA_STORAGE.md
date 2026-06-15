# 数据存储边界

changmen 使用 **RDS（PostgreSQL）** 与 **本机 JSON**。数据层入口为 `@changmen/db`（`GAMEBET_DB_SCRIPT=rds`）。

## 云数据库（生产主路径）

| 表 | 写入方 | 读取方 | 说明 |
|----|--------|--------|------|
| `platform_matches` | 客户端 `API_SaveMatch` → backend | matcher rebuild | 各平台原始比赛 |
| `platform_bets` | `API_SaveBet` | matcher | 各平台赔率快照 |
| `live_timers` | `API_SaveLiveTimer` | backend overlay | 局数/计时 |
| `client_matches` | matcher rebuild | 浏览器 `Client_GetMatchs` | 合并后的比赛列表 |
| `users` / `profiles` / `orders` | 鉴权、下单 API | 前端 | 登录与订单 |
| `canonical_teams` / `team_platform_maps` | team-resolver、matcher | matcher 队名插件 | 队伍 canonical 映射 |

- **RDS 迁移**：`server/backend/db/migrations/`（`node scripts/apply-rds-schema.mjs`）
- **统一 DB 入口**：`@changmen/db`（`server/db/index.js`）

## 本机 JSON（开发 / 凭证 / legacy）

根目录默认 `server/backend/storage/`（可用 `GAMEBET_STORAGE_DIR` / `ESPORT_DATA_DIR` 覆盖）。

| 路径 | 用途 | 是否上云 |
|------|------|----------|
| `storage/platforms.json` | 场馆采集凭证（gateway/token） | 否；`platform_sync` 启动时读写 |
| `storage/tag_platforms.json`、`players.json`、`player_orders.json` | 信用盘本地目录 | 否 |
| `storage/default_odds.json` | 初赔快照 | 否 |
| `storage/sessions.json` | 用户活跃时间缓存 | 否 |
| `storage/legacy/esport/*.json` | 开发 legacy 镜像（若存在） | 否；与 RDS 并行 |

内存缓存：`core/esport-api/store.js` 中的 `_matches` / `_bets` / `_timers` 对齐 legacy 文件形状，**比赛列表生产以 `client_matches` 为准**。

## 清理策略

| 数据 | 机制 |
|------|------|
| 过期 `platform_*` / `client_matches` | matcher 每小时 prune（`server/db/prune_stale.js`，1h 阈值）；`client_matches` 过期设 `list_status=-1` 不删行 |
| 手动兜底 | `node scripts/prune-stale.mjs` |

详见 [ARCHITECTURE.md](./ARCHITECTURE.md) 数据流。
