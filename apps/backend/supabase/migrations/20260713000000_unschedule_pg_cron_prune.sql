-- prune-stale-* 已迁至 gamebet-matcher（packages/shared/db/prune_stale.js，默认每小时）
-- 避免与 matcher 重复 DELETE

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
