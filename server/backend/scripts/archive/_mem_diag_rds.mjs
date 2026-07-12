#!/usr/bin/env node
/** One-shot RDS + team-resolver footprint (run on VPS from server/backend). */
import * as db from "@changmen/db";

const sz = (o) => (o == null ? 0 : JSON.stringify(o).length);

await db.initLastWrittenIds?.();

const [matchesRaw, bets, timers, teams, maps, clientRows] = await Promise.all([
  db.fetchPlatformMatches(),
  db.fetchPlatformBets(),
  db.fetchLiveTimers(),
  db.fetchAllCanonicalTeams(),
  db.fetchAllTeamPlatformMaps(),
  db.fetchClientMatches(),
]);

const betKeys = Object.keys(bets || {});
const matchPlatforms = Object.keys(matchesRaw || {});
let matchRowCount = 0;
for (const rows of Object.values(matchesRaw || {})) {
  if (Array.isArray(rows)) matchRowCount += rows.length;
}

console.log(JSON.stringify({
  platformMatchesJson: sz(matchesRaw),
  platformBetsJson: sz(bets),
  liveTimersJson: sz(timers),
  clientMatchesJson: sz(clientRows),
  betKeys: betKeys.length,
  matchPlatforms: matchPlatforms.length,
  matchRowCount,
  clientMatchCount: clientRows?.length ?? 0,
  canonicalTeams: teams?.length ?? 0,
  teamPlatformMaps: maps?.length ?? 0,
  largestBetKey: betKeys.reduce((best, k) => {
    const n = sz(bets[k]);
    return n > (best?.n ?? 0) ? { k, n } : best;
  }, null),
}, null, 2));
