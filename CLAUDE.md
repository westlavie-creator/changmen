# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 仓库边界

| 目录 | 状态 | 用途 |
|---|---|---|
| `changmen/` | **可修改** | 全部可运行代码：后端、前端、Chrome 扩展、脚本 |
| `A8/` | **只读** | A8 系统原版前端 bundle 和 Chrome 插件，仅供分析对照 |
| `pingtai_offical/` | **只读** | 各平台官网抓包资料，仅供分析 |

所有开发均在 `changmen/` 进行。完整命令与架构见 `changmen/CLAUDE.md`。

根目录 `package.json` 只是把脚本转发到 `changmen/`：

```bat
npm run web        # 启动后端（端口 3456）
npm run app:dev    # 启动 Vite 前端（端口 5174）
npm run app:build  # 构建前端
```

---

## A8 参考文件

| 文件 | 用途 |
|---|---|
| `A8/A8frontendscipts/2.0.1/index.js` | 压缩 bundle，用 PowerShell 正则搜索 |
| `A8/A8chromeplug/2.0.149/content.js` | Chrome 扩展 content script |
| `A8/A8chromeplug/2.0.149/background.js` | Chrome 扩展 background script |

引用 A8 行为时必须使用以下标签：
- `[A8 可证实]` — 直接来自 bundle 代码或网络抓包
- `[changmen 推测]` — 从 API 形状推断，没有 A8 服务端源码
- `[changmen 扩展]` — A8 bundle 里完全不存在的能力

从压缩 bundle 提取代码片段：
```powershell
$c = Get-Content "A8\A8frontendscipts\2.0.1\index.js" -Raw
[regex]::Matches($c, '.{0,200}关键词.{0,200}') | ForEach-Object { $_.Value }
```

---

## Supabase 数据库表结构

迁移文件在 `changmen/gamebet_backend/supabase/migrations/`，推送命令：
```bat
cd changmen\gamebet_backend && npx supabase db push
```

### 各表说明

**`profiles`** — 每个 Supabase auth 用户一行，存 `setting`（jsonb）、`accounts`（jsonb）。

**`orders`** — 投注订单，通过 `user_id → profiles(id)` 按用户隔离。

**`ob_matches`** — 后端 FeedHub 写入的 OB 原始比赛数据（历史遗留，仅 OB）。

**`client_matches`** — 浏览器消费的最终比赛列表。由比赛匹配脚本写入，浏览器通过 `Client_GetMatchs` 只读此表。每行的 `bets` 字段包含各平台聚合赔率，前端自行计算套利。

**`platform_matches`** — 各平台原始比赛（SaveMatch 写入）。主键 `(platform, source_match_id)`。`match_id → client_matches(id)` 初始为 NULL，由后期匹配脚本填入。

**`platform_bets`** — 各平台原始赔率（SaveBet 写入），upsert 覆盖最新，主键 `(platform, source_bet_id)`。无外键约束（SaveBet 的 matchId 可能不在 platform_matches 里）。

**`live_timers`** — OB 比赛当前局数/计时器（SaveLiveTimer 写入），upsert 覆盖最新，主键 `(platform, source_match_id)`。无外键约束（timer 数据覆盖范围大于 platform_matches 过滤后的比赛集）。

### RLS 规则
- 所有表：`service_role` 写入（绕过 RLS），`authenticated` 只能 SELECT。
- Supabase 客户端优先使用 `SUPABASE_SERVICE_KEY`，fallback 到 `SUPABASE_KEY`。

---

## 数据采集流

```
浏览器（各平台按间隔执行）：
  saveMatchSource  → POST API_SaveMatch  → 后端 store.saveMatches()
                                               ├── 写 storage/legacy/esport/matches.json
                                               └── fire-and-forget → supabase platform_matches

  saveBetSource    → POST API_SaveBet    → 后端 store.saveBets()
                                               ├── 写 storage/legacy/esport/bets.json
                                               └── fire-and-forget → supabase platform_bets

  saveLiveTimer    → POST API_SaveLiveTimer → 后端 store.saveLiveTimer()
                                               ├── 写 storage/legacy/esport/live_timers.json
                                               └── fire-and-forget → supabase live_timers

比赛匹配脚本（后期）：
  读 platform_matches → 按（开赛时间 ±15分钟 + 队名 + 游戏）分组
  → upsert client_matches → 回写 platform_matches.match_id
```

各平台 saveMatch 执行间隔（来自 A8 bundle）：

| 平台 | 循环间隔 | saveMatch 实际频率 |
|---|---|---|
| RAY / Stake / TF | 30 秒 | 每 30 秒 |
| OB | 3 秒循环 | 每 60 秒（时间门控） |
| PB / XBet | 1 秒循环 | 每 60 秒（时间门控） |
| IA | — | 事件驱动（Socket.IO `"done"` 消息） |

`CollectConfig` 只控制是否调用 `saveMatchSource`/`saveBetSource` 上报数据，不控制采集器是否连接场馆。采集器始终运行，开关仅是上报的门控。

---

## Supabase pg_cron 定时任务

pg_cron 运行在 **Supabase 服务端**，不依赖本地进程，应用关机时仍持续执行。

### 当前任务

| 任务名 | 执行频率 | 时间戳字段 | 作用 |
|---|---|---|---|
| `prune-stale-platform-matches` | 每小时整点 | `synced_at` | 删除超过 2 小时未上报的平台原始比赛行 |
| `prune-stale-platform-bets` | 每小时整点 | `updated_at` | 删除超过 2 小时未更新的平台赔率行 |
| `prune-stale-live-timers` | 每小时整点 | `updated_at` | 删除超过 2 小时未更新的计时器行 |
| `prune-stale-client-matches` | 每小时整点 | `built_at` | 删除超过 2 小时未重建的客户端比赛行，触发 Realtime DELETE 通知前端 |

### 设计原理

各写入函数每次操作都刷新对应的时间戳字段为 `now()`。比赛结束后平台停止上报，时间戳冻结。pg_cron 每小时检查：超过 2 小时未刷新的行视为过期并删除。

- `platform_matches.synced_at`：`writePlatformMatches` 刷新
- `platform_bets.updated_at` / `live_timers.updated_at`：`writePlatformBets` / `writeLiveTimers` 刷新
- `client_matches.built_at`：`saveClientMatches`（由 `rebuildClientMatchListNow` 调用）刷新

阈值 2 小时 = 各平台最长采集间隔（60 秒）× 充裕缓冲。

`client_matches` 的 pg_cron 还解决了**重启后遗留行**问题：服务重启时 `_lastWrittenIds` 清零，差量删除失效。启动时调用 `initLastWrittenIds()` 预填该 Set，使首次 rebuild 能正确删除遗留行；pg_cron 作为第二道防线，确保即使应用逻辑失效也能兜底清理。

### 管理命令（在 Supabase SQL Editor 执行）

```sql
-- 查看所有任务
SELECT * FROM cron.job;

-- 查看执行历史
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;

-- 删除任务
SELECT cron.unschedule('prune-stale-platform-matches');
```

迁移文件：`changmen/gamebet_backend/supabase/migrations/20260620000000_pg_cron_platform_matches.sql`

---

## 生产安全

`x-proxy-url` 中继在生产环境存在 SSRF 风险，详见 `SECURITY_NOTES.md`。关键项：目标域名白名单、路径前缀限制、必须鉴权、审计日志。
