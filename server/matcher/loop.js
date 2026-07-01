import {
  formatArchiveCounts,
  archiveStaleClientMatchRows,
} from "@changmen/db";
import { MATCHER_CLIENT_MATCH_ARCHIVE_INTERVAL_MS, MATCHER_INTERVAL_MS } from "./lib/config.js";
import { writeMatcherHeartbeat } from "./lib/heartbeat.js";
import { ensureTeamPlugin, matchMergeOnce } from "./ops/match_merge_once.js";
import "./lib/env.js";

const INTERVAL_MS = MATCHER_INTERVAL_MS;
const ARCHIVE_INTERVAL_MS = MATCHER_CLIENT_MATCH_ARCHIVE_INTERVAL_MS;

let lastArchiveAt = 0;
let archiveInFlight = null;
let loopTimer = null;
let loopRunning = false;
let loopMode = "standalone";

async function maybeArchiveStaleClientMatches() {
  const now = Date.now();
  if (lastArchiveAt && now - lastArchiveAt < ARCHIVE_INTERVAL_MS)
    return;
  if (archiveInFlight)
    return archiveInFlight;
  archiveInFlight = (async () => {
    const ar = await archiveStaleClientMatchRows();
    lastArchiveAt = Date.now();
    if (ar.rds) {
      console.log(`[matcher] archive client_matches (scope=${ar.scope}): ${formatArchiveCounts(ar.rds)}`);
    }
  })().finally(() => {
    archiveInFlight = null;
  });
  return archiveInFlight;
}

export async function runMatcherOnce({ mode = loopMode } = {}) {
  await maybeArchiveStaleClientMatches();
  const result = await matchMergeOnce();
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
  const hotParts = Object.entries(result.hotCollector || {})
    .filter(([, enabled]) => enabled)
    .map(([key]) => key);
  const hotNote = hotParts.length ? ` · hot=${hotParts.join(",")}` : "";
  console.log(
    `[matcher] ${new Date().toISOString()} matchMerge ${result.matchCount} matches${
      teamNote
    }${hotNote}${result.matchIdBackfill?.updated
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
  writeMatcherHeartbeat({
    matchCount: null,
    intervalMs: INTERVAL_MS,
    builtAt: null,
    mode,
  });
  console.log(
    `[matcher] starting (${mode}), interval=${INTERVAL_MS / 1000}s, client_matches archive every ${ARCHIVE_INTERVAL_MS / 1000}s`,
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
