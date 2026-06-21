#!/usr/bin/env node
import { ensurePgPoolReady } from "@changmen/db";
import {
  allMapBetsClosed,
  isClientMatchEnded,
  isInLiveTimer,
} from "../../match-engine/merge/match_lifecycle.js";

const matchId = Number(process.argv[2] || 128);
const pool = await ensurePgPoolReady();
const cm = (await pool.query("SELECT * FROM client_matches WHERE id=$1", [matchId])).rows[0];
if (!cm) {
  console.error("no row");
  process.exit(1);
}

const pms = (
  await pool.query("SELECT platform, source_match_id, is_live, match_id FROM platform_matches WHERE match_id=$1", [
    matchId,
  ])
).rows;
const timers = (await pool.query("SELECT platform, source_match_id, round FROM live_timers")).rows;

const platformMatches = {};
for (const pm of pms) {
  if (!platformMatches[pm.platform])
    platformMatches[pm.platform] = {};
  platformMatches[pm.platform][pm.source_match_id] = {
    SourceMatchID: pm.source_match_id,
    IsLive: pm.is_live,
  };
}
const timersByProvider = {};
for (const t of timers) {
  if (!timersByProvider[t.platform])
    timersByProvider[t.platform] = {};
  timersByProvider[t.platform][t.source_match_id] = t;
}

const row = {
  Round: cm.round,
  StartTime: cm.start_time,
  Matchs: cm.matchs,
  Bets: cm.bets,
};

const now = Date.now();
console.log(`── lifecycle diag #${matchId} ──`);
console.log("Round:", cm.round, "| hasOb:", !!(cm.matchs?.OB));
console.log("isInLiveTimer:", isInLiveTimer(cm.matchs, timersByProvider));
console.log("allMapBetsClosed:", allMapBetsClosed(cm.bets));
console.log("isClientMatchEnded:", isClientMatchEnded(row, platformMatches, timersByProvider, now));
console.log("\nBets:");
for (const b of cm.bets || []) {
  const src = Object.entries(b.Sources || {})
    .map(([p, s]) => `${p}:${s?.Status || "Normal"}`)
    .join(", ");
  console.log(`  Map ${b.Map} | ${src}`);
}
console.log("\nplatform_matches is_live:", pms.map(p => `${p.platform}=${p.is_live}`).join(", "));
console.log("\nbo:", cm.bo, "| start:", cm.start_time);

const map0 = (cm.bets || []).find(b => (b.Map ?? 0) === 0);
if (map0) {
  console.log(
    "Map0 statuses:",
    Object.entries(map0.Sources || {})
      .map(([p, s]) => `${p}:${s?.Status}`)
      .join(", "),
  );
}

await pool.end();
