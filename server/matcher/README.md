# server/matcher — 赛事合并

matchMerge 循环**内嵌在 `changmen-web`**（`npm run web` / PM2 `changmen-web`），本目录提供合并库、运维 API 与可选人工 UI。

## 入口

| 入口 | 命令 | 端口 | 作用 |
|------|------|------|------|
| **内嵌合并循环** | `npm run web`（backend 启动时自动） | 无独立端口 | 每 30s（`MATCHER_INTERVAL_MS`）matchMerge + 每小时 client_matches archive |
| **人工 UI** | `npm run matcher:ui` → `ui/server.js` | `4567`（`MATCHER_UI_PORT`） | 拖线关联、画布；**非生产必需** |
| **主站桥接** | 随 `npm run web` | 同源 `/matcher/`、`/matcher/api/*` | backend `http_bridge.js` 把 API 转给 matcher Express |

Matcher 间隔/端口等环境变量由 `lib/config.js` 统一读取（勿在多处写 `process.env.MATCHER_*`）。

PM2（`deploy/ecosystem.config.cjs`）仅注册 `changmen-web` 与 `changmen-pm-sports`；合并循环随 web 进程启动。

## 依赖

- `server/match-engine` — 合并算法
- `server/db` — 读写 `platform_matches` / `client_matches` 等（`@changmen/db`）
- `server/team-resolver` — 可选队名 canonical 插件

环境变量：与 backend 共用 `server/backend/.env`（或本目录 `matcher/.env`）。`CHANGMEN_DB_SCRIPT` 与 backend 保持一致（兼容 `GAMEBET_DB_SCRIPT`）。

## 常用命令

```bash
cd changmen
npm run web             # backend + 内嵌 matchMerge 循环
npm run matcher:ui      # 独立 UI http://localhost:4567
```

心跳文件：`server/matcher/.matcher-heartbeat.json`（gitignore）。

## 数据边界（Client_GetMatchs vs matchMerge）

| 路径 | 职责 | 允许的操作 |
|------|------|------------|
| **matchMerge**（本目录 + `match-engine`） | 读 `platform_matches` / `platform_bets` / `live_timers` → 写 `client_matches` | 合并、Reverse/reconcile、决胜局 promote、Map=0 trim、Round、gb 锁 |
| **Client_GetMatchs**（`server/backend`） | 读 `client_matches` 返回前端 | **只消费**，不做 Bets/Sources/Reverse/Round 二次变换 |

写库前统一走 `finalizeClientMatchListAfterLinks`（`match-engine` 导出）。

### 主客朝向（gb 锁）

锚点链定初值：**Polymarket → OB → RAY**（第一个双侧 `gb_team_id` 已映射平台的 native 主客槽位）。无锚点平台时回落 min/max 投票。已写入的 `home_gb_team_id` / `away_gb_team_id` **永不自动翻转**；人工纠错用 UI「主客对调（翻锁）」。

`Client_GetMatchs` 只读 `client_matches`。`SaveLiveTimer` debounce 触发 matchMerge（`MATCHER_TIMER_DEBOUNCE_MS`，默认 3s），常规循环由 `MATCHER_INTERVAL_MS` 驱动。

```bash
# 巡检 client_matches vs platform_bets / matchMerge 预览
node server/matcher/scripts/audit-client-sources.mjs
node server/matcher/scripts/audit-client-sources.mjs --quick
node server/matcher/scripts/audit-client-sources.mjs --strict
```

matchMerge 诊断日志：`MATCHER_MERGE_DIAG=1`。

更多：[../../docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md)、[../../scripts/README.md](../../scripts/README.md)。
