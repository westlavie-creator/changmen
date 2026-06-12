-- pg_cron：定时清理 client_matches 过期行
--
-- 设计原理：
--   saveClientMatches 每次 rebuild 都刷新活跃比赛的 built_at = now()
--   比赛下架后不再参与 rebuild，built_at 冻结
--   超过 2 小时未刷新 → 比赛已结束 → 安全删除
--   删除触发 Supabase Realtime DELETE 事件 → 前端自动移除对应行
--
-- 阈值与 platform_matches 保持一致：2 小时

SELECT cron.schedule(
  'prune-stale-client-matches',
  '0 * * * *',
  $$
    DELETE FROM client_matches
    WHERE built_at < (extract(epoch from now()) * 1000) - 7200000;
  $$
);
