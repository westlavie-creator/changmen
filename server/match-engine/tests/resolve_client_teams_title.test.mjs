import assert from "node:assert/strict";
/**
 * 人工链路 Title 应与 titleFromMatchs / reconcile 一致：OB 优先于 RAY，不用陈旧 DB title。
 */
import { it } from "vitest";
import { titleFromMatchs } from "../merge/match_merge.js";
import { teamsFromPlatformRows } from "../teams/provider_priority.js";
import { lookupCanonicalTeamName, lookupGbTeamIdByPlatform } from "../teams/team_key.js";

const SUBTOP = "Subtop De France";
const JULIE = "Julie&Cie";

const matches = {
  IA: {
    "375096": {
      SourceMatchID: "375096",
      Home: SUBTOP,
      Away: JULIE,
      HomeID: "ia-h",
      AwayID: "ia-a",
      SourceGameID: "8",
    },
  },
  RAY: {
    "38403021": {
      SourceMatchID: "38403021",
      Home: SUBTOP,
      Away: JULIE,
      HomeID: "ray-h",
      AwayID: "ray-a",
      SourceGameID: "8",
    },
  },
  OB: {
    "5717530547693393": {
      SourceMatchID: "5717530547693393",
      Home: JULIE,
      Away: SUBTOP,
      HomeID: "ob-h",
      AwayID: "ob-a",
      SourceGameID: "8",
    },
  },
};

const matchs = {
  IA: "375096",
  RAY: "38403021",
  OB: "5717530547693393",
};

function buildPlatformRowsFromSnapshot(matchsMap, platformsById) {
  const rows = [];
  for (const [platform, sourceMatchId] of Object.entries(matchsMap)) {
    const row = platformsById[`${platform}:${sourceMatchId}`];
    if (!row)
      continue;
    rows.push({
      platform,
      home: row.home,
      away: row.away,
      homeId: row.home_id,
      awayId: row.away_id,
    });
  }
  return rows;
}

it("stale DB title Subtop-first vs linked platforms → effective title Julie-first (OB priority)", () => {
  const platformsById = {};
  for (const [plat, byId] of Object.entries(matches)) {
    for (const [srcId, m] of Object.entries(byId)) {
      platformsById[`${plat}:${srcId}`] = {
        platform: plat,
        source_match_id: srcId,
        home: m.Home,
        away: m.Away,
        home_id: m.HomeID,
        away_id: m.AwayID,
        source_game_id: m.SourceGameID,
      };
    }
  }

  const fromMerge = titleFromMatchs(matchs, matches);
  assert.ok(fromMerge?.title);
  assert.ok(fromMerge.title.startsWith(JULIE), `titleFromMatchs=${fromMerge.title}`);

  const rows = buildPlatformRowsFromSnapshot(matchs, platformsById);
  const picked = teamsFromPlatformRows(rows, {
    lookupGbTeamId: lookupGbTeamIdByPlatform,
    lookupCanonicalName: lookupCanonicalTeamName,
  });
  assert.equal(picked?.home, JULIE);
  assert.equal(picked?.away, SUBTOP);

  const staleDbTitle = `${SUBTOP} vs ${JULIE}`;
  assert.notEqual(staleDbTitle, fromMerge.title);
});
