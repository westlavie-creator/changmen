-- pg_cron：定时清理 platform_matches 过期行
--
-- 设计原理：
--   writePlatformMatches 每次写入都刷新 synced_at = now()
--   活跃比赛 synced_at 始终保持最新；结束的比赛停止上报后 synced_at 冻结
--   超过 2 小时未刷新 → 比赛已结束 → 安全删除
--
-- 执行频率：每小时整点（Supabase 服务端自动运行，不依赖本地进程）
-- 阈值选择：各平台最长采集间隔 60 秒，2 小时是充裕的缓冲

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 授权 postgres 角色使用 cron schema
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL ON ALL TABLES IN SCHEMA cron TO postgres;

SELECT cron.schedule(
  'prune-stale-platform-matches',
  '0 * * * *',
  $$
    DELETE FROM platform_matches
    WHERE synced_at < (extract(epoch from now()) * 1000) - 7200000;
  $$
);
