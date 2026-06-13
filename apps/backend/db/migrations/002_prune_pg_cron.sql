-- 可选：RDS 已开通 pg_cron 扩展时执行（阿里云部分规格支持）
-- 默认不再注册：过期清理由 gamebet-matcher 每小时执行（见 packages/shared/db/prune_stale.js）
-- 若仍想用 pg_cron，可手动执行下方 schedule；或改用 scripts/prune-stale.mjs + 系统 cron
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/002_prune_pg_cron.sql

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $do$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT jobid FROM cron.job
    WHERE jobname IN (
      'prune-stale-platform-matches',
      'prune-stale-platform-bets',
      'prune-stale-live-timers',
      'prune-stale-client-matches'
    )
  LOOP
    PERFORM cron.unschedule(r.jobid);
  END LOOP;
END
$do$;

SELECT cron.schedule(
  'prune-stale-platform-matches',
  '0 * * * *',
  $$
    DELETE FROM platform_matches
    WHERE synced_at < (extract(epoch from now()) * 1000) - 7200000;
  $$
);

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

SELECT cron.schedule(
  'prune-stale-client-matches',
  '0 * * * *',
  $$
    DELETE FROM client_matches
    WHERE built_at < (extract(epoch from now()) * 1000) - 7200000;
  $$
);
