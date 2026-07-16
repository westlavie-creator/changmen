#!/usr/bin/env node
/**
 * 按最高锚点（PM→OB→RAY）强制重锚左右，报告翻转场次。
 *   node scripts/reanchor.mjs              # dry-run
 *   MATCH_PROJECTOR_WRITE=1 node scripts/reanchor.mjs --write
 */
import "../lib/env.js";
import { projectMergeOnce } from "../ops/project_merge_once.js";
import { isProjectorWriteEnabled } from "../lib/config.js";

process.env.MATCH_PROJECTOR_REANCHOR = "1";
const write = isProjectorWriteEnabled() || process.argv.includes("--write");
const result = await projectMergeOnce({
  write,
  registerTeams: true,
  forceReanchorOrientation: true,
});

const flipped = (result.info || [])
  .filter(m => String(m._lockAnchor || "").startsWith("reanchor"))
  .map(m => ({
    id: m.ID,
    title: m.Title,
    lock: [m.HomeGbTeamId, m.AwayGbTeamId],
    lockSource: m._lockAnchor,
    reverse: m.Reverse,
  }));

console.log(JSON.stringify({
  wrote: result.wrote,
  matchCount: result.matchCount,
  projectStats: result.projectStats,
  reanchorCount: flipped.length,
  sample: flipped.slice(0, 20),
}, null, 2));

process.exit(0);
