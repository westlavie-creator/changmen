# 数据存储边界

changmen 同时使用 **云数据库**（Supabase / RDS）与 **本机 JSON**。读路径由 `GAMEBET_DB_SCRIPT`（`packages/shared/db/db_mode.js`）决定。

## 云数据库（生产主路径）

| 表 | 写入方 | 读取方 | 说明 |
|----|--------|--------|------|
| `platform_matches` | 客户端 `API_SaveMatch` → backend | matcher rebuild | 各平台原始比赛 |
| `platform_bets` | `API_SaveBet` | matcher | 各平台赔率快照 |
| `live_timers` | `API_SaveLiveTimer` | backend overlay | 局数/计时 |
| `client_matches` | matcher rebuild | 浏览器 `Client_GetMatchs` | 合并后的比赛列表 |
| `profiles` / `orders` | 鉴权、下单 API | 前端 | 用户设置与订单 |
| `canonical_teams` / `team_platform_maps` | team-resolver、matcher | matcher 队名插件 | 队伍 canonical 映射 |

- **Supabase 迁移**：`apps/backend/supabase/migrations/`（`cd apps/backend && npx supabase db push`）
- **RDS 迁移**：`apps/backend/db/migrations/`（`node scripts/apply-rds-schema.mjs`）
- **统一 DB 入口**：`packages/shared/db/index.js`（勿直连 `supabase.js` 旧路径）

`dual` 模式：读 RDS，写 Supabase + RDS（见 `db_mode.js`）。

## 本机 JSON（开发 / 凭证 / legacy）

根目录默认 `apps/backend/storage/`（可用 `GAMEBET_STORAGE_DIR` / `ESPORT_DATA_DIR` 覆盖）。

| 路径 | 用途 | 是否上云 |
|------|------|----------|
| `storage/platforms.json` 或 `data/esport/platforms.json` | 场馆采集凭证（gateway/token） | 否；`platform_sync` 启动时读写 |
| `storage/tag_platforms.json` 等 | 标签/配置类 JSON | 否 |
| `storage/legacy/esport/*.json` | 开发 legacy 镜像（部分 save 仍 fire-and-forget 写盘） | 否；与 Supabase 并行 |

内存缓存：`core/esport-api/store.js` 中的 `_matches` / `_bets` / `_timers` 对齐 legacy 文件形状，**比赛列表生产以 `client_matches` 为准**。

## 迁移文件为何不搬到 `packages/shared`

Supabase CLI 默认认 `apps/backend/supabase/`；RDS 脚本与 `import-from-supabase.mjs` 同目录更易运维。逻辑层已集中在 `packages/shared/db/`。

## 清理策略

| 数据 | 机制 |
|------|------|
| 过期 `platform_*` / `client_matches` | matcher 每小时 prune（`packages/shared/db/prune_stale.js`，2h 阈值） |
| Supabase pg_cron prune | 已迁移到 matcher；可选执行 `20260713000000_unschedule_pg_cron_prune.sql` |

详见根目录 `CLAUDE.md` 各表说明与 [ARCHITECTURE.md](./ARCHITECTURE.md) 数据流。
