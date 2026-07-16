#!/usr/bin/env node
/**
 * 对比：composer 结果 vs 当前 RDS client_matches（不写库）。
 *   node scripts/diff.mjs
 *   node scripts/diff.mjs --id=1189
 */
import "../lib/env.js";
import * as db from "@changmen/db";
import { composeOnce } from "../ops/compose_once.js";
import {
  checkHomeSlotConsistency,
  checkReverseSubsetOfSources,
} from "../src/invariants.js";

const idArg = process.argv.find(a => a.startsWith("--id="));
const onlyId = idArg ? Number(idArg.slice(5)) : null;

const result = await composeOnce({ write: false, registerTeams: false });
const rows = db.isMatcherStoreReady() ? await db.fetchClientMatches() : [];
const byId = new Map((rows || []).map(r => [Number(r.id), r]));

let diffs = 0;
let invariantFails = 0;
for (const m of result.info || []) {
  const id = Number(m.ID);
  if (onlyId != null && id !== onlyId)
    continue;

  const revOk = checkReverseSubsetOfSources(m);
  if (!revOk.ok) {
    invariantFails += 1;
    console.log(`#${id} INVARIANT reverse: ${revOk.violations.join("; ")}`);
  }

  // 对冲抽样：若有 OB+RAY Map0，检查 Home slot I1（native 缺失时跳过）
  const homeOk = checkHomeSlotConsistency(m, {});
  if (!homeOk.ok && homeOk.violations.some(v => !v.includes("missing native"))) {
    invariantFails += 1;
    console.log(`#${id} INVARIANT I1: ${homeOk.violations.join("; ")}`);
  }

  const cur = byId.get(id);
  if (!cur) {
    if (id > 0) {
      console.log(`#${id} NEW title=${m.Title} reverse=${JSON.stringify(m.Reverse)}`);
      diffs += 1;
    }
    continue;
  }
  const curRev = Array.isArray(cur.reverse) ? cur.reverse : [];
  const newRev = Array.isArray(m.Reverse) ? m.Reverse : [];
  const titleChanged = String(cur.title || "") !== String(m.Title || "");
  const revChanged = JSON.stringify([...curRev].sort()) !== JSON.stringify([...newRev].sort());
  const lockChanged
    = String(cur.home_gb_team_id || "") !== String(m.HomeGbTeamId || "")
    || String(cur.away_gb_team_id || "") !== String(m.AwayGbTeamId || "");

  const curBets = Array.isArray(cur.bets) ? cur.bets : [];
  const newBets = m.Bets || [];
  let sourcesChanged = false;
  for (const nb of newBets) {
    const cb = curBets.find(b => (Number(b.Map) || 0) === (Number(nb.Map) || 0));
    const cSrc = cb?.Sources || {};
    const nSrc = nb.Sources || {};
    for (const p of new Set([...Object.keys(cSrc), ...Object.keys(nSrc)])) {
      if (String(cSrc[p]?.HomeID || "") !== String(nSrc[p]?.HomeID || "")
        || String(cSrc[p]?.AwayID || "") !== String(nSrc[p]?.AwayID || "")) {
        sourcesChanged = true;
        break;
      }
    }
    if (sourcesChanged)
      break;
  }

  if (titleChanged || revChanged || lockChanged || sourcesChanged) {
    diffs += 1;
    console.log(`--- #${id} ---`);
    if (titleChanged)
      console.log(`  title: ${cur.title} → ${m.Title}`);
    if (lockChanged)
      console.log(`  lock: ${cur.home_gb_team_id}/${cur.away_gb_team_id} → ${m.HomeGbTeamId}/${m.AwayGbTeamId}`);
    if (revChanged)
      console.log(`  reverse: ${JSON.stringify(curRev)} → ${JSON.stringify(newRev)}`);
    if (sourcesChanged)
      console.log(`  sources: HomeID/AwayID 有差异`);
  }
}

console.log(
  `\ndiff count=${diffs} composed=${result.matchCount}`
  + ` locked=${result.projectStats.locked} invariantFails=${invariantFails}`,
);
process.exit(invariantFails > 0 ? 2 : 0);
