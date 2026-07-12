import dotenv from "dotenv";
import pg from "pg";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../server/backend/.env") });

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const q = async (sql, params = []) => (await client.query(sql, params)).rows;

const cms = await q(`
  SELECT id, title, game, start_time, round, matchs, bets
  FROM client_matches
  WHERE title ILIKE '%UCAM%' OR title ILIKE '%FOKUS%'
  ORDER BY start_time DESC
  LIMIT 10
`);

console.log("=== client_matches ===");
for (const r of cms) {
  const ob = r.matchs?.OB;
  const betsSummary = (r.bets || []).map(b => ({
    map: b.Map,
    sources: Object.keys(b.Sources || {}),
    home: b.HomeName,
    away: b.AwayName,
  }));
  console.log(JSON.stringify({
    id: r.id,
    title: r.title,
    game: r.game,
    start_time: r.start_time,
    round: r.round,
    matchs: r.matchs,
    betsSummary,
  }, null, 2));
}

const pms = await q(`
  SELECT platform, source_match_id, home, away, match_id, synced_at, source_game_id
  FROM platform_matches
  WHERE home ILIKE '%UCAM%' OR away ILIKE '%UCAM%'
     OR home ILIKE '%FOKUS%' OR away ILIKE '%FOKUS%'
  ORDER BY synced_at DESC
  LIMIT 30
`);

console.log("\n=== platform_matches ===");
for (const r of pms)
  console.log(JSON.stringify(r));

const links = await q(`
  SELECT platform, source_match_id, match_id
  FROM platform_matches
  WHERE match_id IN (
    SELECT id FROM client_matches
    WHERE title ILIKE '%UCAM%' OR title ILIKE '%FOKUS%'
  )
`);

console.log("\n=== platform→client links ===");
for (const r of links)
  console.log(JSON.stringify(r));

const cm697 = await q(`
  SELECT id, title, matchs, bets, round, built_at
  FROM client_matches WHERE id = 697
`);
console.log("\n=== client_match 697 full matchs ===");
console.log(JSON.stringify(cm697[0]?.matchs, null, 2));

const linked = await q(`
  SELECT platform, source_match_id, home, away, match_id, synced_at
  FROM platform_matches
  WHERE match_id = 697
     OR source_match_id IN ('5702887722893045', '38402327', '374916', '1632213268', '636843')
  ORDER BY platform
`);
console.log("\n=== all platforms for match 697 ===");
for (const r of linked)
  console.log(JSON.stringify(r));

for (const [plat, sid] of Object.entries(cm697[0]?.matchs || {})) {
  const pb = await q(`
    SELECT COUNT(*)::int AS n FROM platform_bets
    WHERE platform = $1 AND source_match_id = $2
  `, [plat, String(sid)]);
  const pm = await q(`
    SELECT home, away, synced_at FROM platform_matches
    WHERE platform = $1 AND source_match_id = $2
  `, [plat, String(sid)]);
  console.log(`\n--- ${plat} #${sid} ---`);
  console.log("platform_match:", pm[0] || "MISSING (pruned/stale)");
  console.log("platform_bets count:", pb[0]?.n);
}

const obBets = await q(`
  SELECT source_bet_id, map, bet_name, home_odds, away_odds, updated_at
  FROM platform_bets
  WHERE platform = 'OB' AND source_match_id = '5702887722893045'
  ORDER BY map
  LIMIT 10
`);
console.log("\n=== OB platform_bets ===");
for (const r of obBets)
  console.log(JSON.stringify(r));

const cm697bets = await q(`SELECT bets FROM client_matches WHERE id = 697`);
const bets = cm697bets[0]?.bets || [];
console.log("\n=== OB Sources in client_match 697 ===");
for (const b of bets) {
  const ob = b.Sources?.OB;
  if (ob) console.log(JSON.stringify({ map: b.Map, ob }, null, 2));
}

const hist = await q(`
  SELECT id, built_at FROM client_matches_history
  WHERE id = 697 ORDER BY built_at DESC LIMIT 3
`);
console.log("\n=== history built_at ===");
console.log(hist);

const obPmHist = await q(`
  SELECT platform, source_match_id, home, away, match_id, synced_at
  FROM platform_matches
  WHERE platform IN ('OB','RAY') AND (home ILIKE '%UCAM%' OR away ILIKE '%FOKUS%' OR match_id = 697)
  ORDER BY synced_at DESC LIMIT 10
`);
console.log("\n=== OB/RAY platform_matches (any) ===");
for (const r of obPmHist) console.log(JSON.stringify(r));

const mk = await q(`SELECT merge_key FROM client_matches WHERE id = 697`);
console.log("\n=== merge_key ===");
console.log(mk[0]?.merge_key);

const tm = await q(`
  SELECT venue, venue_team_id, venue_name, gb_team_id
  FROM team_venue_maps
  WHERE venue_name ILIKE '%UCAM%' OR venue_name ILIKE '%FOKUS%'
  LIMIT 20
`);
console.log("\n=== team_venue_maps ===");
for (const r of tm) console.log(JSON.stringify(r));

const cm697meta = await q(`SELECT id, built_at FROM client_matches WHERE id = 697`);
console.log("\n=== client_match 697 meta ===");
console.log(cm697meta[0]);
console.log("now ms", Date.now(), "built_at age min", (Date.now() - Number(cm697meta[0]?.built_at)) / 60000);

await client.end();
