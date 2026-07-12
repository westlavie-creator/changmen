# 数据存储边界

changmen 使用 **RDS（PostgreSQL）** 与 **本机 JSON**。数据层入口为 `@changmen/db`（`CHANGMEN_DB_SCRIPT=rds`）。

## 云数据库（生产主路径）

| 表 | 写入方 | 读取方 | 说明 |
|----|--------|--------|------|
| `platform_matches` | 客户端 `API_SaveMatch` → backend | embedded matcher matchMerge | 各平台原始比赛 |
| `platform_bets` | `API_SaveBet` | embedded matcher | 各平台赔率快照 |
| `live_timers` | `API_SaveLiveTimer` → backend | embedded matcher matchMerge | 局数/计时；GetMatchs 不再 overlay |
| `client_matches` | embedded matcher matchMerge | 浏览器 `Client_GetMatchs`（只读，不改写） | 合并后的比赛列表 |
| `users` / `profiles` / `orders` | 鉴权、下单 API | 前端 | 登录与订单 |
| `canonical_teams` / `team_venue_maps` | team-resolver、matcher | matcher 队名插件 | 队伍 canonical 映射 |

- **RDS 迁移**：`server/backend/db/migrations/`（`node scripts/apply-rds-schema.mjs`）
- **统一 DB 入口**：`@changmen/db`（`server/db/index.js`）

## 本机 JSON（开发 / 凭证 / legacy）

根目录默认 `server/backend/storage/`（可用 `CHANGMEN_STORAGE_DIR` / `ESPORT_DATA_DIR` 覆盖；兼容 `GAMEBET_STORAGE_DIR`）。

| 路径 | 用途 | 是否上云 |
|------|------|----------|
| `storage/platforms.json` | 场馆采集凭证（gateway/token） | 否；`platform_sync` 启动时读写 |
| `storage/tag_platforms.json`、`players.json` | 已废弃（仅 `migrate-players-to-rds` 导入 RDS） | — |
| `storage/default_odds.json` | 初赔快照 | 否 |
| 用户活跃时间 | RDS `profiles.preferences.lastActiveAt`（`user_presence`，60s 防抖写库） |
| `storage/legacy/esport/*.json` | 开发 legacy 镜像（若存在） | 否；与 RDS 并行 |

内存缓存：`core/esport-api/store.js` 中的 `_matches` / `_bets` / `_timers` 对齐 legacy 文件形状，matcher 进程内还有 RDS snapshot cache；**比赛列表生产以 `client_matches` 为准**。

## 清理策略

| 数据 | 机制 |
|------|------|
| `platform_matches` / `platform_bets` / `live_timers` | **SaveMatch / SaveLiveTimer 全量快照** + 孤儿删除（不在本批 = 平台认为已消失） |
| `client_matches` 离开活跃列表 | matchMerge 每轮 diff 删除 → 移入 `client_matches_history` |
| `client_matches` 长期未 matchMerge | matcher 每小时 **archive**（`server/db/archive_stale.js`，`built_at` 1h 阈值） |
| 手动兜底 | `npm run db:archive-stale`（`scripts/ops/migrations/archive-stale-client-matches.mjs`） |

详见 [ARCHITECTURE.md](./ARCHITECTURE.md) 数据流。

---

## API 数据策略（memory-first 与 RDS）

约定：**HTTP 响应尽量从进程内内存返回**；RDS 负责持久化、冷启动灌入、以及必须强一致的读写。实现入口：`server/backend/core/esport-api/router.ts`；action 名以 `@changmen/api-contract` 为准。

这与「Redis 缓存」不同：内存往往是**主工作集**（write-behind / write-through），不只是 RDS 的只读副本。

### 模式代号

| 代号 | 含义 | API 何时返回 | RDS 角色 |
|------|------|--------------|----------|
| **M→A** | Memory-first + Async persist | 改完内存即返回 | 后台队列 / fire-and-forget（`rds/common.js` `_writeRds`） |
| **M→S** | Memory-first + Sync persist | 等 RDS 成功再返回 | 强一致写入 |
| **M+R** | Memory 读 + RDS 校验 | 优先内存；可能轻量查 meta | 持久化 +  occasional 校验 |
| **R** | RDS-direct | 查/写完库再返回 | 唯一数据源 |
| **J** | Local JSON | 读写在 `storage/*.json` | 文件持久化，不进 RDS |
| **—** | 非数据 / 转发 | — | — |

**改 API 前先看本表**：高频可重建 → M→A / M+R；鉴权 / 订单 / 资金 → 禁止改成 fire-and-forget。

### 核心链路（采集 + 列表）

| Action | 模式 | 读 | 写 | 备注 |
|--------|------|----|----|------|
| `API_SaveMatch` | M→A | — | 内存 `_matches` → 异步 RDS | 保持 |
| `API_SaveBet` | M→A | — | 内存 `_bets` → 异步 RDS | 保持 |
| `API_SaveLiveTimer` | M→A* | — | 内存 `_timers` → `writeLiveTimersAsync` | *当前 await RDS，可改为与 SaveBet 一致 |
| `API_SaveScore` | — | — | 空实现 | — |
| `API_UpdatePlatform` | J | `platforms.json` | 同步写文件 | 多实例前勿假设共享 |
| `Client_GetMatchs` | M+R | 内存 `client_matches`；built_at/pm_sport_rev 未变跳过全量 SELECT | — | 只读 matchMerge 结果，不做 Round/promote overlay |
| `Client_GetDefaultOdds` / `GetMatchDefaultOdds` | M+J | 内存列表 + `default_odds.json` | debounce 写 JSON | — |

### 采集凭证 / 游戏

| Action | 模式 | 说明 |
|--------|------|------|
| `Client_GetCollectPlatform` | J + 外部 | `platforms.json`；TF 可能调 Node 探针后写文件 |
| `Client_GetGames` | J + 内存 | shared catalog + platform 行 |

### 鉴权 / 用户配置

| Action | 模式 | 说明 |
|--------|------|------|
| `Client_Login` | R | 必须 RDS 验密；成功后 `loadProfileById` 灌内存 |
| `Client_Logout` / `Client_RefreshToken` | R | token 会话在 RDS |
| `Client_GetUserInfo` | M | JWT 后纯内存 profile |
| `Client_UpdateSetting` | M→A | 内存 + `writeProfile` fire-and-forget |
| `Client_SaveData` / `Client_GetData` | M→A / M | KV、CollectConfig 等走 `core/db/store.js` 内存 |

### 账号 / Player

| Action | 模式 | 说明 |
|--------|------|------|
| `Client_GetAccounts` | M | `profiles.accounts` 内存 |
| `Client_SaveAccounts` | M→A | 内存 + 异步 RDS；创建前校验 player Exist（R） |
| `Client_CreateTagPlatform` | M→S | 必须等 RDS 建 player 成功 |
| `Client_UpdateBalance` / `DeletePlayer` | M→S | 余额与删除须 RDS ACK |

### 订单 / 资金（强一致区）

| Action | 模式 | 说明 |
|--------|------|------|
| `Client_SaveOrder` / `SaveOrderBind` | M→S | `await upsertOrders`；**禁止** fire-and-forget |
| `Client_GetOrderList` / `GetPlayerOrder` | R | 直查 RDS；可选未来加热内存索引 |
| `Client_SaveMoneyLog` / `DeleteMoneyLog` | M→S | await RDS |
| `Client_MonthReport` / `GetUserProfit` | R | 聚合 SQL |

### 管理端

全部 **R**（`Client_Admin*`）：报表与运维写操作直读写 RDS；`Client_AdminUsers` 在线状态可读内存 profile。

### 其它

| Action | 模式 |
|--------|------|
| `Client_GetUsers` | M（`listProfileRows` + presence） |
| `Client_GetChatHistory` | —（固定 `[]`） |
| `SendMessage` | 外部（Telegram） |

### 非 `/esport/*` action

| 路径 | 能否内存回复 |
|------|--------------|
| `/esport/http-relay`、各平台 proxy | 否，转发 upstream |
| `/v4.0/*` | 否 |
| `/`、`/assets/*` | 静态文件，非 RDS |

### 分层总览

```text
高频采集/列表（Save* / GetMatchs）     → M→A / M+R   ✅ 已基本实现
用户配置/KV（SaveData / GetData）      → M→A         ✅ 已实现
订单/资金/鉴权                         → M→S / R     ❌ 勿改 fire-and-forget
管理报表                               → R           只读 DB
场馆凭证                               → J           platforms.json（非 RDS）
```

### 可选优化（低优先级）

| 接口 | 方向 | 风险 |
|------|------|------|
| `API_SaveLiveTimer` | 与 SaveBet 一样纯 M→A | 重启丢最近 timer |
| `Client_GetMatchs` | built_at 未变时零 RDS（连 meta 不查） | 仅单机内嵌 matcher 安全 |
| `Client_GetOrderList` | 热订单内存 + RDS 异步 | 实现复杂 |
| `platforms.json` | 多实例前迁 RDS 或共享存储 | 部署拓扑变化 |

### 相关代码

| 位置 | 职责 |
|------|------|
| `core/esport-api/store.js` | 采集内存 `_matches` / `_bets` / `_timers` |
| `core/db/store.js` | profile / client_matches 内存与 built_at 缓存 |
| `server/db/rds/common.js` | `_writeRds` 写队列 |
| `server/matcher/ops/rds_snapshot_cache.js` | matchMerge 读路径（内嵌优先内存） |
| `server/storage/platform_storage.js` | `platforms.json` |
