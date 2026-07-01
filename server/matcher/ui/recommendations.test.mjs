import assert from "node:assert/strict";
import { beforeEach, describe, it } from "vitest";
import { setTeamPlugin } from "@changmen/match-engine";
import {
  attachObSpineHints,
  computeMergeKeyRecommendations,
} from "./recommendations.js";

describe("recommendations merge keys", () => {
  beforeEach(() => {
    setTeamPlugin({
      lookupById(platform, platformId) {
        const maps = {
          "OB:10": "gb1",
          "OB:20": "gb2",
          "RAY:30": "gb1",
          "RAY:40": "gb2",
        };
        return maps[`${platform}:${platformId}`] || null;
      },
    });
  });

  it("groups by id merge key when gb maps exist", () => {
    const rows = [
      {
        platform: "OB",
        source_match_id: "m1",
        source_game_id: "8",
        home: "Team A",
        away: "Team B",
        home_id: "10",
        away_id: "20",
        start_time: 1_700_000_000_000,
        game: { code: "valorant", name: "valorant" },
      },
      {
        platform: "RAY",
        source_match_id: "m2",
        source_game_id: "8",
        home: "Team A",
        away: "Team B",
        home_id: "30",
        away_id: "40",
        start_time: 1_700_000_000_000,
        game: { code: "valorant", name: "valorant" },
      },
    ];
    const recs = computeMergeKeyRecommendations(rows, { isLinked: () => false });
    assert.equal(recs.length, 1);
    assert.equal(recs[0].merge_basis, "id");
    assert.equal(recs[0].platforms.sort().join(","), "OB,RAY");
  });

  it("attachObSpineHints suggests client with OB anchor", () => {
    const allMatches = [{
      platform: "RAY",
      source_match_id: "r9",
      source_game_id: "8",
      home: "Team A",
      away: "Team B",
      home_id: "30",
      away_id: "40",
      start_time: 1_700_000_000_000,
      game: { code: "valorant", name: "valorant" },
    }];
    const clientMatches = [{
      id: 55,
      title: "Team A vs Team B",
      game_id: "8",
      start_time: 1_700_000_000_000,
      matchs: { OB: "ob1" },
    }];
    const platformKeyMap = new Map([
      ["OB:ob1", {
        platform: "OB",
        source_match_id: "ob1",
        source_game_id: "8",
        home: "Team A",
        away: "Team B",
        home_id: "10",
        away_id: "20",
        start_time: 1_700_000_000_000,
        game: { code: "valorant", name: "valorant" },
      }],
    ]);
    const out = attachObSpineHints(allMatches, clientMatches, platformKeyMap);
    assert.equal(out[0].ob_spine_target, 55);
    assert.equal(out[0].ob_spine_anchor, "OB:ob1");
  });
});
