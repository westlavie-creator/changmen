#!/usr/bin/env node
/**
 * 清空某平台 live_timers（部署后清陈旧行，或 OB 采集未跑时的兜底）
 *
 *   cd changmen/apps/backend && node scripts/purge-platform-live-timers.mjs OB
 */

import { purgePlatformLiveTimers } from "@changmen/db";

const platform = process.argv[2] || "OB";

try {
  await purgePlatformLiveTimers(platform);
  console.log(`[purge-live-timers] cleared live_timers for platform=${platform}`);
} catch (err) {
  console.error("[purge-live-timers] failed:", err.message);
  process.exit(1);
}
