#!/usr/bin/env node
/**
 * 对比：投影结果 vs 当前 RDS client_matches（不写库）。
 *   node scripts/diff.mjs
 *   node scripts/diff.mjs --id=1189
 */
import "../lib/env.js";
import * as db from "@changmen/db";
import { projectMergeOnce } from "../ops/project_merge_once.js";

const idArg = process.argv.find(a => a.startsWith("--id="));
const onlyId = idArg ? Number(idArg.slice(5)) : null;

const result = await projectMergeOnce({ write: false, registerTeams: false });
const rows = await db.fetchClientMatches();
const byId = new Map((rows || []).map(r => [Number(r.id), r]));

let diffs = 0;
for (const m of result.info || []) {
  const id = Number(m.ID);
  if (onlyId != null && id !== onlyId)
    continue;
  const cur = byId.get(id);
  if (!cur) {
    console.log(`#${id} NEW title=${m.Title} reverse=${JSON.stringify(m.Reverse)}`);
    diffs += 1;
    continue;
  }
  const curRev = Array.isArray(cur.reverse) ? cur.reverse : [];
  const newRev = Array.isArray(m.Reverse) ? m.Reverse : [];
  const titleChanged = String(cur.title || "") !== String(m.Title || "");
  const revChanged = JSON.stringify([...curRev].sort()) !== JSON.stringify([...newRev].sort());
  const lockChanged
    = String(cur.home_gb_team_id || "") !== String(m.HomeGbTeamId || "")
    || String(cur.away_gb_team_id || "") !== String(m.AwayGbTeamId || "");

  // Sources 平台集合 / HomeID 抽样
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

console.log(`\ndiff count=${diffs} projected=${result.matchCount} locked=${result.projectStats.locked}`);
process.exit(0);
