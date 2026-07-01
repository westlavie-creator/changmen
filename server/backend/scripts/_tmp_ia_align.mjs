#!/usr/bin/env node
import { loadChangmenEnv } from "@changmen/storage/load_env.js";
import { ensurePgPoolReady } from "@changmen/db";
import { normalizeMatchesShape } from "@changmen/match-engine";
import { canonicalMatchKeyByIdOnly, canonicalMatchKeyByName } from "@changmen/match-engine/teams/team_key.js";
import { getGameCodeForPlatformId } from "@changmen/shared/catalog/game_catalog";
import { resolvePlatformTeamId } from "@changmen/shared/catalog/pb_team_platform_id";
import { normalizeEpochMs } from "@changmen/shared/time/match_time";
import { alignUnmatchedToClientMatches } from "../../matcher/ops/align_unmatched_to_client.js";

loadChangmenEnv();
const pool = await ensurePgPoolReady();

const ia = (await pool.query(`
  SELECT platform, source_match_id, home, away, home_id, away_id, source_game_id, start_time, match_id, synced_at
  FROM platform_matches WHERE platform='IA' AND source_match_id='375274'
`)).rows[0];

const cm804 = (await pool.query(`
  SELECT id, title, game, game_id, start_time, merge_key, matchs, home_gb_team_id, away_gb_team_id
  FROM client_matches WHERE id=804
`)).rows[0];

const maps = (await pool.query(`
  SELECT platform, platform_id, platform_name, canonical_id, game
  FROM team_platform_maps
  WHERE (platform='IA' AND platform_name IN ('FOKUS', 'Mandatory'))
     OR canonical_id IN ('100477', '100508')
  ORDER BY platform, platform_name
`)).rows;

console.log("=== IA match ===");
console.log(JSON.stringify(ia, null, 2));
console.log("\n=== client_match 804 ===");
console.log(JSON.stringify(cm804, null, 2));
console.log("\n=== team_platform_maps ===");
for (const r of maps) console.log(r);

if (ia) {
  const gameCode = getGameCodeForPlatformId("IA", ia.source_game_id);
  const homeId = resolvePlatformTeamId("IA", ia.home_id, ia.source_game_id, gameCode);
  const awayId = resolvePlatformTeamId("IA", ia.away_id, ia.source_game_id, gameCode);
  console.log("\n=== IA resolved ids ===", { gameCode, homeId, awayId });
  const idCk = canonicalMatchKeyByIdOnly(8, ia.home, ia.away, gameCode, { provider: "IA", homeId, awayId });
  const nameCk = canonicalMatchKeyByName(8, ia.home, ia.away);
  console.log("idKey:", idCk);
  console.log("nameKey:", nameCk);
  console.log("IA start:", new Date(normalizeEpochMs(ia.start_time)).toISOString());
  console.log("804 start:", new Date(normalizeEpochMs(cm804?.start_time)).toISOString());
  console.log("time delta min:", Math.abs(normalizeEpochMs(ia.start_time) - normalizeEpochMs(cm804?.start_time)) / 60000);
}

const allPm = (await pool.query(`SELECT * FROM platform_matches`)).rows;
const matchesRaw = {};
for (const r of allPm) {
  if (!matchesRaw[r.platform]) matchesRaw[r.platform] = {};
  matchesRaw[r.platform][r.source_match_id] = {
    SourceMatchID: r.source_match_id,
    Home: r.home,
    Away: r.away,
    HomeID: r.home_id,
    AwayID: r.away_id,
    SourceGameID: r.source_game_id,
    StartTime: r.start_time,
    match_id: r.match_id,
  };
}
const matches = normalizeMatchesShape(matchesRaw);
const clientRows = (await pool.query(`SELECT * FROM client_matches`)).rows;
const stats = alignUnmatchedToClientMatches(matches, clientRows);
console.log("\n=== align stats ===", stats);
const iaAfter = matches.IA?.["375274"];
console.log("IA after align match_id:", iaAfter?.match_id ?? iaAfter?.ClientMatchId);

await pool.end();
