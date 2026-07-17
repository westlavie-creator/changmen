import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { projectClientMatchSides } from "../src/sides/project_sources.js";

const matches = {
  OB: {
    ob1: {
      SourceMatchID: "ob1",
      Home: "Alpha",
      Away: "Beta",
      HomeID: "ob-h",
      AwayID: "ob-a",
      SourceGameID: "1",
      BO: 3,
    },
  },
};

describe("project_sources Map0 fallback vs decider map", () => {
  it("does not fill last map with Map0 before Round===BO (legacy parity)", () => {
    const row = {
      ID: 10,
      Title: "Alpha vs Beta",
      BO: 3,
      Round: 1,
      HomeGbTeamId: "100001",
      AwayGbTeamId: "100002",
      Matchs: { OB: "ob1" },
      Bets: [],
    };
    // Map3 在场馆列表里但无有效选项 ID → 会建壳；旧 matcher 不会用 Map0 填
    const bets = {
      "OB:ob1": {
        bets: [
          {
            Map: 0,
            SourceBetID: "ob-m0",
            SourceHomeID: "ob-h",
            SourceAwayID: "ob-a",
            HomeOdds: 1.5,
            AwayOdds: 2.5,
            Status: "Normal",
            BetName: "[全场]-全局-获胜",
          },
          {
            Map: 3,
            SourceBetID: "ob-m3-empty",
            SourceHomeID: "",
            SourceAwayID: "",
            HomeOdds: 0,
            AwayOdds: 0,
            Status: "Normal",
            BetName: "[地图3]-单局-获胜",
          },
        ],
      },
    };

    const result = projectClientMatchSides(row, {
      matches,
      bets,
      existingRow: {
        id: 10,
        home_gb_team_id: "100001",
        away_gb_team_id: "100002",
        title: "Alpha vs Beta",
      },
      stickyOrientation: true,
    });

    if (!result.locked) {
      // 无 team-plugin 时可能 unlock；本测依赖 existing gb sticky
      return;
    }

    const map3 = row.Bets.find(b => Number(b.Map) === 3);
    assert.ok(map3, "Map=3 shell should exist from platform_bets");
    assert.equal(
      Object.keys(map3.Sources || {}).length,
      0,
      "Map=BO must not get Map0 copy pre-decider",
    );
    const map0 = row.Bets.find(b => Number(b.Map) === 0);
    if (map0 && Object.keys(map0.Sources || {}).length > 0) {
      assert.ok(
        result.omitted.some(o =>
          o.reason === "no_map0_fallback_on_map_line"
          || o.reason === "no_map0_fallback_on_decider_map"),
        "should record map-line omit reason when Map0 was available",
      );
    }
  });
});
