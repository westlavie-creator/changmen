#!/usr/bin/env node
/**
 * 单次投影。
 *   node scripts/once.mjs           # dry-run
 *   node scripts/once.mjs --check   # dry-run + 不变式自检
 *   MATCH_PROJECTOR_WRITE=1 node scripts/once.mjs
 *
 * 独立 --write：MATCHER_WRITER=composer（生产默认）下会被拒；
 * 须 MATCH_PROJECTOR_FORCE_WRITE=1，或显式 MATCHER_WRITER=legacy 并停 esport 合场。
 */
import "../lib/env.js";
import { projectMergeOnce } from "../ops/project_merge_once.js";
import { isProjectorWriteEnabled } from "../lib/config.js";
import { assertProjectorMayWrite } from "../lib/write_guard.js";
import { isComposerWriter } from "../../matcher/lib/matcher_writer.js";
import {
  checkReverseSubsetOfSources,
  checkUnlockedEmpty,
} from "../src/invariants.js";

const write = isProjectorWriteEnabled() || process.argv.includes("--write");
if (write) {
  const guard = assertProjectorMayWrite();
  if (!guard.ok) {
    console.error(`[match-projector] ${guard.reason}`);
    if (isComposerWriter()) {
      console.error(
        "[match-projector] 提示：生产写路径已是 esport 内嵌 composer；"
        + "独立 --write 需 MATCH_PROJECTOR_FORCE_WRITE=1，或 MATCHER_WRITER=legacy 并停 esport 合场。",
      );
    }
    process.exit(1);
  }
}

const doCheck = process.argv.includes("--check");
const result = await projectMergeOnce({ write, registerTeams: true });

let checkViolations = [];
if (doCheck) {
  for (const m of result.info || []) {
    for (const r of [checkReverseSubsetOfSources(m), checkUnlockedEmpty(m)]) {
      if (!r.ok)
        checkViolations.push(...r.violations);
    }
  }
}

console.log(JSON.stringify({
  wrote: result.wrote,
  matchCount: result.matchCount,
  projectStats: result.projectStats,
  checkOk: doCheck ? checkViolations.length === 0 : undefined,
  checkViolations: doCheck ? checkViolations.slice(0, 50) : undefined,
  sample: (result.info || []).slice(0, 5).map(m => ({
    id: m.ID,
    title: m.Title,
    reverse: m.Reverse,
    lock: [m.HomeGbTeamId, m.AwayGbTeamId],
    maps: (m.Bets || []).map(b => ({
      Map: b.Map,
      platforms: Object.keys(b.Sources || {}),
    })),
  })),
}, null, 2));

process.exit(doCheck && checkViolations.length ? 2 : 0);
