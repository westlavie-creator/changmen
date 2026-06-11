"use strict";

/**
 * 独立比赛匹配进程（见 pipei/rebuild.js 共用 rebuild 逻辑）。
 */

require("./lib/env");

const { rebuildOnce, ensureTeamPlugin } = require("./ops/rebuild");

const INTERVAL_MS = Number(process.env.MATCHER_INTERVAL_MS || 30_000);

async function runOnce() {
  const result = await rebuildOnce();
  const { writeMatcherHeartbeat } = require("./lib/heartbeat");
  writeMatcherHeartbeat({ matchCount: result.matchCount, intervalMs: INTERVAL_MS });
  console.log(
    `[matcher] ${new Date().toISOString()} rebuilt ${result.matchCount} matches`
    + (result.matchIdBackfill?.updated
      ? ` · backfill match_id ${result.matchIdBackfill.updated}`
      : ""),
  );
}

async function main() {
  await ensureTeamPlugin();
  console.log(`[matcher] starting, interval=${INTERVAL_MS / 1000}s`);
  await runOnce();
  setInterval(async () => {
    try {
      await runOnce();
    } catch (err) {
      console.error("[matcher] error:", err.message);
    }
  }, INTERVAL_MS);
}

main().catch((err) => {
  console.error("[matcher] fatal:", err);
  process.exit(1);
});
