#!/usr/bin/env node
/**
 * 过期数据清理（手动 / crontab 兜底；常规由 gamebet-matcher 每小时执行）
 *
 *   cd changmen/apps/backend && node scripts/prune-stale.mjs
 */

import { pruneStaleRows, formatPruneCounts } from "../../../packages/shared/db/prune_stale.js";

try {
  const pr = await pruneStaleRows();
  if (pr.rds) console.log(`[prune] rds: ${formatPruneCounts(pr.rds)}`);
  if (pr.supabase) console.log(`[prune] supabase: ${formatPruneCounts(pr.supabase)}`);
  if (!pr.rds && !pr.supabase) {
    console.error("[prune] 无可用数据源（检查 GAMEBET_DB_SCRIPT / DATABASE_URL / Supabase）");
    process.exit(1);
  }
} catch (err) {
  console.error("[prune] 失败:", err.message);
  process.exit(1);
}
