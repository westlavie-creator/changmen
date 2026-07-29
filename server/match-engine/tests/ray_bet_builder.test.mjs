import assert from "node:assert/strict";
import { it } from "vitest";
import { buildBetsForMatch } from "../merge/bet_builder.js";

/**
 * cs2 RAY gameOddGroups（market_catalog.json）：SourceBetID 须为真实 odds_group_id，
 * 否则白名单直接拒绝、不会回退 BetName。本文件只修测例夹具，不改生产过滤逻辑。
 */
const RAY_CS2 = {
  full: "16847",
  map1: "16854",
  map2: "16877",
};

function src(p, b) {
  return {
    Type: p,
    BetID: String(b.SourceBetID),
    HomeID: String(b.SourceHomeID),
    AwayID: String(b.SourceAwayID),
    HomeOdds: b.HomeOdds,
    AwayOdds: b.AwayOdds,
    Status: b.Status,
  };
}

it("rAY: three rows all Map=0 collapse to one client bet (old bug)", () => {
  const bets = {
    "RAY:1": {
      provider: "RAY",
      matchId: "1",
      bets: [
        { SourceBetID: RAY_CS2.full, Map: 0, BetName: "[全场] 获胜者", SourceHomeID: "1", HomeOdds: 2, SourceAwayID: "2", AwayOdds: 1.5, Status: "Normal" },
        { SourceBetID: RAY_CS2.full, Map: 0, BetName: "[全场] 获胜者", SourceHomeID: "3", HomeOdds: 2.1, SourceAwayID: "4", AwayOdds: 1.6, Status: "Normal" },
        { SourceBetID: RAY_CS2.full, Map: 0, BetName: "[全场] 获胜者", SourceHomeID: "5", HomeOdds: 2.2, SourceAwayID: "6", AwayOdds: 1.7, Status: "Normal" },
      ],
    },
  };
  const out = buildBetsForMatch("RAY", "1", 0, bets, src, "cs2");
  assert.equal(out.length, 1);
});

it("rAY: Map 0/1/2 yields three client bets", () => {
  const bets = {
    "RAY:1": {
      provider: "RAY",
      matchId: "1",
      bets: [
        { SourceBetID: RAY_CS2.full, Map: 0, BetName: "[全场] 获胜者", SourceHomeID: "1", HomeOdds: 2, SourceAwayID: "2", AwayOdds: 1.5, Status: "Normal" },
        { SourceBetID: RAY_CS2.map1, Map: 1, BetName: "[地图1] 获胜者", SourceHomeID: "3", HomeOdds: 2.1, SourceAwayID: "4", AwayOdds: 1.6, Status: "Normal" },
        { SourceBetID: RAY_CS2.map2, Map: 2, BetName: "[地图2] 获胜者", SourceHomeID: "5", HomeOdds: 2.2, SourceAwayID: "6", AwayOdds: 1.7, Status: "Normal" },
      ],
    },
  };
  const out = buildBetsForMatch("RAY", "1", 0, bets, src, "cs2");
  assert.deepEqual(out.map(b => b.Map), [0, 1, 2]);
});
