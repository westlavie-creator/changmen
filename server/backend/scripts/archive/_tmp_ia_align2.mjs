import { loadChangmenEnv } from "@changmen/storage/load_env.js";
import { ensurePgPoolReady } from "@changmen/db";
import { normalizeMatchesShape, MERGE_START_TIME_TOLERANCE_MS, startTimesCompatible, startTimesCompatibleStrict } from "@changmen/match-engine";
import { canonicalMatchKeyByIdOnly, canonicalMatchKeyByName } from "@changmen/match-engine/teams/team_key.js";
import { normalizeEpochMs } from "@changmen/shared/time/match_time";
import { getGameCodeForPlatformId } from "@changmen/shared/catalog/game_catalog";
import { resolvePlatformTeamId } from "@changmen/shared/catalog/pb_team_platform_id";
import { alignUnmatchedToClientMatches, resolveClientMatchIdKey, resolveClientMatchNameKey } from "../../matcher/ops/align_unmatched_to_client.js";
import { ensureTeamPlugin } from "../../matcher/ops/match_merge_once.js";

loadChangmenEnv();
await ensureTeamPlugin();
const pool = await ensurePgPoolReady();

const allPm = (await pool.query(`SELECT * FROM platform_matches WHERE match_id=804 OR (platform='IA' AND source_match_id='375274')`)).rows;
const matchesRaw = {};
for (const r of allPm) {
  if (!matchesRaw[r.platform]) matchesRaw[r.platform] = {};
  matchesRaw[r.platform][r.source_match_id] = {
    SourceMatchID: r.source_match_id,
    Home: r.home, Away: r.away,
    HomeID: r.home_id, AwayID: r.away_id,
    SourceGameID: r.source_game_id,
    StartTime: r.start_time,
    match_id: r.match_id,
  };
}
const matches = normalizeMatchesShape(matchesRaw);
const cm804 = (await pool.query(`SELECT * FROM client_matches WHERE id=804`)).rows[0];

console.log("Tolerance min:", MERGE_START_TIME_TOLERANCE_MS / 60000);
for (const r of allPm) {
  const st = normalizeEpochMs(r.start_time);
  const delta = Math.abs(st - normalizeEpochMs(cm804.start_time)) / 60000;
  console.log(`${r.platform} #${r.source_match_id}: start=${new Date(st).toISOString()} deltaVs804=${delta.toFixed(1)}min compatible=${startTimesCompatible(st, cm804.start_time)} strict=${startTimesCompatibleStrict(st, cm804.start_time)}`);
}

const idKey804 = resolveClientMatchIdKey(cm804, matches);
const nameKey804 = resolveClientMatchNameKey(cm804, matches);
console.log("\n804 idKey:", idKey804);
console.log("804 nameKey:", nameKey804);

const ia = matches.IA?.["375274"];
const gameCode = getGameCodeForPlatformId("IA", ia.SourceGameID);
const homeId = resolvePlatformTeamId("IA", ia.HomeID, ia.SourceGameID, gameCode);
const awayId = resolvePlatformTeamId("IA", ia.AwayID, ia.SourceGameID, gameCode);
const idCk = canonicalMatchKeyByIdOnly(8, ia.Home, ia.Away, gameCode, { provider: "IA", homeId, awayId });
const nameCk = canonicalMatchKeyByName(8, ia.Home, ia.Away);
console.log("\nIA idKey:", idCk?.key);
console.log("IA nameKey:", nameCk?.key);
console.log("id keys match:", idCk?.key === idKey804);
console.log("name keys match:", nameCk?.key === nameKey804);

const stats = alignUnmatchedToClientMatches(matches, [cm804]);
console.log("\nalign stats:", stats);
console.log("IA match_id after:", matches.IA?.["375274"]?.ClientMatchId);

await pool.end();
