import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatArchiveCounts,
  archiveStaleClientMatchRows,
} from "@changmen/db";
import {
  PROJECTOR_INTERVAL_MS,
  PROJECTOR_ARCHIVE_INTERVAL_MS,
  isProjectorWriteEnabled,
} from "./lib/config.js";
import "./lib/env.js";
import { writeProjectorHeartbeat } from "./lib/heartbeat.js";
import { projectMergeOnce } from "./ops/project_merge_once.js";

let timer = null;
let running = false;
let lastArchiveAt = 0;
let archiveInFlight = null;

async function maybeArchiveStaleClientMatches() {
  if (!isProjectorWriteEnabled())
    return;
  const now = Date.now();
  if (lastArchiveAt && now - lastArchiveAt < PROJECTOR_ARCHIVE_INTERVAL_MS)
    return;
  if (archiveInFlight)
    return archiveInFlight;
  archiveInFlight = (async () => {
    const ar = await archiveStaleClientMatchRows();
    lastArchiveAt = Date.now();
    if (ar.rds) {
      console.log(
        `[match-projector] archive client_matches (scope=${ar.scope}): ${formatArchiveCounts(ar.rds)}`,
      );
    }
  })().finally(() => {
    archiveInFlight = null;
  });
  return archiveInFlight;
}

export async function runProjectorOnce() {
  await maybeArchiveStaleClientMatches();
  const result = await projectMergeOnce({ write: isProjectorWriteEnabled() });
  writeProjectorHeartbeat({
    matchCount: result.matchCount,
    intervalMs: PROJECTOR_INTERVAL_MS,
    builtAt: result.builtAt,
    wrote: result.wrote,
  });
  const writeNote = result.wrote ? "WRITE" : "dry-run";
  console.log(
    `[match-projector] ${new Date().toISOString()} ${writeNote} matches=${result.matchCount}`
    + ` locked=${result.projectStats.locked} unlocked=${result.projectStats.unlocked}`
    + ` omits=${result.projectStats.omitEvents}`
    + ` reanchored=${result.projectStats.reanchored || 0}`,
  );
  return result;
}

export async function startProjectorLoop() {
  if (running)
    return { ok: false, alreadyRunning: true };
  running = true;
  console.log(
    `[match-projector] loop interval=${PROJECTOR_INTERVAL_MS / 1000}s`
    + ` write=${isProjectorWriteEnabled() ? "ON" : "OFF (set MATCH_PROJECTOR_WRITE=1)"}`
    + ` reanchor=${String(process.env.MATCH_PROJECTOR_REANCHOR || "").trim() === "1" ? "ON" : "OFF"}`,
  );
  console.log(
    "[match-projector] 生产接替请用 MATCHER_SIDE_ENGINE=projector（挂在 matchMergeOnce）；"
    + "独立 WRITE 循环勿与 legacy matcher 双写",
  );

  const tick = async () => {
    try {
      await runProjectorOnce();
    }
    catch (err) {
      console.error("[match-projector] tick failed:", err);
    }
  };

  await tick();
  timer = setInterval(tick, PROJECTOR_INTERVAL_MS);
  return { ok: true, pid: process.pid, timer, intervalMs: PROJECTOR_INTERVAL_MS };
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  startProjectorLoop().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
