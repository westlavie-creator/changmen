/**
 * 独立比赛匹配进程（见 ops/rebuild.js 共用 rebuild 逻辑）。
 */

import "./lib/env.js";
import { rebuildOnce, ensureTeamPlugin } from "./ops/rebuild.js";
import { writeMatcherHeartbeat } from "./lib/heartbeat.js";
import {
  DEFAULT_PRUNE_INTERVAL_MS,
  pruneStaleRows,
  formatPruneCounts,
} from "../../packages/shared/db/index.js";

const INTERVAL_MS = Number(process.env.MATCHER_INTERVAL_MS || 30_000);
const PRUNE_INTERVAL_MS = Number(process.env.MATCHER_PRUNE_INTERVAL_MS || DEFAULT_PRUNE_INTERVAL_MS);

let lastPruneAt = 0;

async function maybePruneStale() {
  const now = Date.now();
  if (lastPruneAt && now - lastPruneAt < PRUNE_INTERVAL_MS) return;
  lastPruneAt = now;
  const pr = await pruneStaleRows();
  if (pr.rds) {
    console.log(`[matcher] prune rds: ${formatPruneCounts(pr.rds)}`);
  }
  if (pr.supabase) {
    console.log(`[matcher] prune supabase: ${formatPruneCounts(pr.supabase)}`);
  }
}

async function runOnce() {
  await maybePruneStale();
  const result = await rebuildOnce();
  writeMatcherHeartbeat({ matchCount: result.matchCount, intervalMs: INTERVAL_MS, builtAt: result.builtAt });
  console.log(
    `[matcher] ${new Date().toISOString()} rebuilt ${result.matchCount} matches`
    + (result.matchIdBackfill?.updated
      ? ` · backfill match_id ${result.matchIdBackfill.updated}`
      : ""),
  );
}

async function main() {
  await ensureTeamPlugin();
  console.log(
    `[matcher] starting, interval=${INTERVAL_MS / 1000}s, prune every ${PRUNE_INTERVAL_MS / 1000}s`,
  );
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
