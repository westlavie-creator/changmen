import {
  formatPruneCounts,
  pruneStaleRows,
} from "@changmen/db";
import { MATCHER_INTERVAL_MS, MATCHER_PRUNE_INTERVAL_MS } from "./lib/config.js";
import { writeMatcherHeartbeat } from "./lib/heartbeat.js";
import { ensureTeamPlugin, rebuildOnce } from "./ops/rebuild.js";
import "./lib/env.js";

const INTERVAL_MS = MATCHER_INTERVAL_MS;
const PRUNE_INTERVAL_MS = MATCHER_PRUNE_INTERVAL_MS;

let lastPruneAt = 0;
let pruneInFlight = null;
let loopTimer = null;
let loopRunning = false;
let loopMode = "standalone";

async function maybePruneStale() {
  const now = Date.now();
  if (lastPruneAt && now - lastPruneAt < PRUNE_INTERVAL_MS)
    return;
  if (pruneInFlight)
    return pruneInFlight;
  pruneInFlight = (async () => {
    const pr = await pruneStaleRows();
    lastPruneAt = Date.now();
    if (pr.rds) {
      console.log(`[matcher] prune rds: ${formatPruneCounts(pr.rds)}`);
    }
  })().finally(() => {
    pruneInFlight = null;
  });
  return pruneInFlight;
}

export async function runMatcherOnce({ mode = loopMode } = {}) {
  await maybePruneStale();
  const result = await rebuildOnce();
  writeMatcherHeartbeat({
    matchCount: result.matchCount,
    intervalMs: INTERVAL_MS,
    builtAt: result.builtAt,
    mode,
  });
  const teamNote = result.teamReg?.registered > 0
    ? ` · 自动收录队伍 ${result.teamReg.registered} 条`
    : result.teamReg?.scanned > 0
      ? ` · 队伍扫描 ${result.teamReg.scanned}（无新增）`
      : "";
  console.log(
    `[matcher] ${new Date().toISOString()} rebuilt ${result.matchCount} matches${
      teamNote
    }${result.matchIdBackfill?.updated
      ? ` · backfill match_id ${result.matchIdBackfill.updated}`
      : ""}`,
  );
  return result;
}

export async function startMatcherLoop(opts = {}) {
  const mode = opts.mode || "standalone";
  if (loopRunning) {
    return { ok: false, alreadyRunning: true, mode: loopMode, pid: process.pid };
  }
  loopMode = mode;
  loopRunning = true;
  await ensureTeamPlugin();
  console.log(
    `[matcher] starting (${mode}), interval=${INTERVAL_MS / 1000}s, prune every ${PRUNE_INTERVAL_MS / 1000}s`,
  );

  const tick = async () => {
    try {
      await runMatcherOnce({ mode });
    }
    catch (err) {
      console.error("[matcher] error:", err.message);
      if (opts.exitOnFatal)
        throw err;
    }
  };

  try {
    await tick();
  }
  catch (err) {
    loopRunning = false;
    throw err;
  }

  loopTimer = setInterval(() => {
    void tick().catch((err) => {
      console.error("[matcher] fatal tick:", err);
      if (opts.exitOnFatal)
        process.exit(1);
    });
  }, INTERVAL_MS);

  return { ok: true, mode, pid: process.pid, intervalMs: INTERVAL_MS };
}

export function stopMatcherLoop() {
  if (loopTimer) {
    clearInterval(loopTimer);
    loopTimer = null;
  }
  const wasRunning = loopRunning;
  loopRunning = false;
  return { ok: true, stopped: wasRunning, mode: loopMode, pid: process.pid };
}

export function getMatcherLoopState() {
  return {
    running: loopRunning,
    mode: loopMode,
    pid: loopRunning ? process.pid : null,
    intervalMs: INTERVAL_MS,
  };
}
