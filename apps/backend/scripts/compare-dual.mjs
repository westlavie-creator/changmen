#!/usr/bin/env node
/**
 * dual 对账：Supabase vs RDS 各表行数
 *
 *   cd changmen/apps/backend && node scripts/compare-dual.mjs
 */

import {
  compareDualRowCounts,
  formatCompareDualReport,
  initDatabaseUrl,
} from "@changmen/db";

await initDatabaseUrl();

const result = await compareDualRowCounts();
if (!result) {
  console.log("[compare-dual] 非 dual 模式，跳过");
  process.exit(0);
}

for (const line of formatCompareDualReport(result)) {
  console.log(line);
}

if (!result.ok) process.exitCode = 1;
