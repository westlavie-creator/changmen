-- pg_cron：定时清理 platform_bets / live_timers 过期行
--
-- 设计原理：
--   writePlatformBets / writeLiveTimers 每次写入都刷新 updated_at = now()
--   活跃比赛的赔率和计时器 updated_at 始终保持最新；比赛结束后停止上报，updated_at 冻结
--   超过 2 小时未刷新 → 比赛已结束 → 安全删除
--
-- 阈值与 platform_matches 保持一致：各平台最长采集间隔 60 秒，2 小时是充裕的缓冲

SELECT cron.schedule(
  'prune-stale-platform-bets',
  '0 * * * *',
  $$
    DELETE FROM platform_bets
    WHERE updated_at < (extract(epoch from now()) * 1000) - 7200000;
  $$
);

SELECT cron.schedule(
  'prune-stale-live-timers',
  '0 * * * *',
  $$
    DELETE FROM live_timers
    WHERE updated_at < (extract(epoch from now()) * 1000) - 7200000;
  $$
);
