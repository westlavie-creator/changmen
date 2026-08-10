#!/usr/bin/env node
/**
 * 时间归档（手动 / crontab 兜底；生产 matcher 每小时执行 client scope = no-op）
 *
 *   cd changmen/server/backend && node scripts/ops/migrations/archive-stale-client-matches.mjs
 *   node scripts/ops/migrations/archive-stale-client-matches.mjs --legacy-platform   # platform_* / live_timers
 *   node scripts/ops/migrations/archive-stale-client-matches.mjs --all                 # 同 legacy-platform（不搬 client_matches）
 *
 * ended_at 生命周期：client_matches 锚点永不冷搬到 history（避免强制结束/已结束场复活）。
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
