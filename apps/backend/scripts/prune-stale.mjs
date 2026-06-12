#!/usr/bin/env node
/**
 * 过期数据清理（pg_cron 不可用时的 VPS 定时任务兜底）
 * 阈值：2 小时未刷新（与 Supabase pg_cron 一致）
 *
 * crontab 示例（每小时整点）：
 *   0 * * * * cd /path/changmen/apps/backend && node scripts/prune-stale.mjs
 */

import pg from "pg";

import "../../../packages/shared/db/load_env.js";

const STALE_MS = 2 * 60 * 60 * 1000;
const cutoff = Date.now() - STALE_MS;

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("缺少 DATABASE_URL");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });

try {
  await client.connect();
  const r1 = await client.query(
    "DELETE FROM platform_matches WHERE synced_at < $1",
    [cutoff],
  );
  const r2 = await client.query(
    "DELETE FROM platform_bets WHERE updated_at < $1",
    [cutoff],
  );
  const r3 = await client.query(
    "DELETE FROM live_timers WHERE updated_at < $1",
    [cutoff],
  );
  const r4 = await client.query(
    "DELETE FROM client_matches WHERE built_at < $1",
    [cutoff],
  );
  console.log(
    `[prune] platform_matches=${r1.rowCount} platform_bets=${r2.rowCount} live_timers=${r3.rowCount} client_matches=${r4.rowCount}`,
  );
} catch (err) {
  console.error("[prune] 失败:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
