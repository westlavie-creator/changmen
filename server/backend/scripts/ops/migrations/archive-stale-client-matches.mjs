#!/usr/bin/env node
/**
 * client_matches 时间归档（手动 / crontab 兜底；生产由 gamebet-matcher 每小时执行）
 *
 *   cd changmen/server/backend && node scripts/ops/migrations/archive-stale-client-matches.mjs
 *   node scripts/ops/migrations/archive-stale-client-matches.mjs --legacy-platform   # 含 platform_* / live_timers 时间清理（旧行为）
 *   node scripts/ops/migrations/archive-stale-client-matches.mjs --all                 # 全部表
 */

import {
  ARCHIVE_SCOPE_ALL,
  ARCHIVE_SCOPE_CLIENT,
  ARCHIVE_SCOPE_LEGACY_PLATFORM,
  archiveStaleRows,
  formatArchiveCounts,
} from "@changmen/db";

const args = new Set(process.argv.slice(2));
const scope = args.has("--all")
  ? ARCHIVE_SCOPE_ALL
  : args.has("--legacy-platform")
    ? ARCHIVE_SCOPE_LEGACY_PLATFORM
    : ARCHIVE_SCOPE_CLIENT;

try {
  const ar = await archiveStaleRows({ scope });
  if (ar.rds)
    console.log(`[archive] scope=${ar.scope} ${formatArchiveCounts(ar.rds)}`);
  if (!ar.rds) {
    console.error("[archive] 无可用数据源（检查 DATABASE_URL / DATABASE_URL_PUBLIC / DATABASE_URL_INTERNAL）");
    process.exit(1);
  }
}
catch (err) {
  console.error("[archive] 失败:", err.message);
  process.exit(1);
}
