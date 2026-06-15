#!/usr/bin/env node
/**
 * 过期数据清理（手动 / crontab 兜底；常规由 gamebet-matcher 每小时执行）
 *
 *   cd changmen/server/backend && node scripts/prune-stale.mjs
 */

import { pruneStaleRows, formatPruneCounts } from "@changmen/db";

try {
  const pr = await pruneStaleRows();
  if (pr.rds) console.log(`[prune] rds: ${formatPruneCounts(pr.rds)}`);
  if (!pr.rds) {
    console.error("[prune] 无可用数据源（检查 DATABASE_URL / DATABASE_URL_PUBLIC / DATABASE_URL_INTERNAL）");
    process.exit(1);
  }
} catch (err) {
  console.error("[prune] 失败:", err.message);
  process.exit(1);
}
