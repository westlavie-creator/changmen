#!/usr/bin/env node
import "../lib/env.js";
import { getPgPool } from "@changmen/db";
import { ensurePgPoolReady } from "@changmen/db";

const keyword = process.argv[2] || "DeathMark";
const pool = await ensurePgPoolReady();

const cm = await pool.query(
  `SELECT id, title, game, round, round_start, start_time, matchs, bets, built_at, list_status
   FROM client_matches WHERE title ILIKE '%' || $1 || '%'`,
  [keyword],
);

for (const r of cm.rows) {
  console.log(`\n=== id=${r.id} ${r.title} ===`);
  console.log(`  game: ${r.game}`);
  console.log(`  round: ${r.round}  round_start: ${r.round_start}`);
  console.log(`  start_time: ${new Date(Number(r.start_time)).toISOString()}`);
  console.log(`  built_at: ${new Date(Number(r.built_at)).toISOString()}`);
  console.log(`  list_status: ${r.list_status}`);
  console.log(`  matchs: ${JSON.stringify(r.matchs)}`);

  const platforms = r.matchs || {};
  for (const [plat, sid] of Object.entries(platforms)) {
    const lt = await pool.query(
      "SELECT * FROM live_timers WHERE platform=$1 AND source_match_id=$2",
      [plat, String(sid)],
    );
    for (const t of lt.rows) {
      console.log(`  timer: ${t.platform} mid=${t.source_match_id} round=${t.round} round_start=${t.round_start} updated=${new Date(Number(t.updated_at)).toISOString()}`);
    }
    if (!lt.rows.length) {
      console.log(`  timer: ${plat} mid=${sid} (无记录)`);
    }
  }

  const bets = r.bets;
  if (bets) {
    const betRows = Array.isArray(bets) ? bets : bets.Bets || bets.bets || [];
    for (const bet of betRows) {
      const sources = bet.Sources || bet.sources || {};
      const platforms = Object.keys(sources);
      const status = platforms.map(p => {
        const s = sources[p];
        return `${p}:${s.HomeOdds}/${s.AwayOdds}(${s.Status || "?"})`;
      }).join(" ");
      console.log(`  bet: Map=${bet.Map} ${bet.Name} | ${status}`);
    }
  }
}

await pool.end();
