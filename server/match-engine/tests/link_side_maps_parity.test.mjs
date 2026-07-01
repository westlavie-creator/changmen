import assert from "node:assert/strict";
/**
 * 拖线「主客颠倒」与反转按钮应写出相同 platform override（经 reconcile 验证）。
 */
import { it } from "vitest";
import { reconcileClientMatchReverse, setTeamPlugin } from "../merge/match_merge.js";

const SUBTOP = "Subtop De France";
const JULIE = "Julie&Cie";
const GB_JULIE = "C-julie";
const GB_SUBTOP = "C-subtop";
const CM_ID = 1;

function reconcileWithOverride(overrideMode) {
  setTeamPlugin({
    lookupById: (platform, pid) => ({
      "RAY:ray-h": GB_SUBTOP,
      "RAY:ray-a": GB_JULIE,
    })[`${platform}:${pid}`] || null,
    lookupGbTeamIdByNormalizedName: (norm) => {
      if (String(norm).includes("julie"))
        return GB_JULIE;
      if (String(norm).includes("subtop"))
        return GB_SUBTOP;
      return null;
    },
  });

  const rows = [
    {
      ID: CM_ID,
      Title: `${JULIE} vs ${SUBTOP}`,
      HomeGbTeamId: GB_JULIE,
      AwayGbTeamId: GB_SUBTOP,
      Matchs: { RAY: "38403021" },
      Bets: [{ Map: 0, Sources: {} }],
    },
  ];
  const matches = {
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
  };
  const bets = {
    "RAY:38403021": {
      provider: "RAY",
      matchId: "38403021",
      bets: [{
        SourceBetID: "r",
        Map: 0,
        BetName: "[全场] 获胜者",
        SourceHomeID: "ray-h",
        HomeOdds: 1.97,
        SourceAwayID: "ray-a",
        AwayOdds: 1.85,
        Status: "Normal",
      }],
    },
  };
  const overrides = overrideMode ? { [CM_ID]: { RAY: overrideMode } } : {};
  reconcileClientMatchReverse(rows, matches, bets, {}, (p, b) => ({
    Type: p,
    BetID: String(b.SourceBetID),
    HomeID: String(b.SourceHomeID),
    AwayID: String(b.SourceAwayID),
    HomeOdds: b.HomeOdds,
    AwayOdds: b.AwayOdds,
    Status: b.Status,
  }), overrides);
  setTeamPlugin(null);
  return rows[0];
}

it("link/toggle force_aligned → RAY not in Reverse", () => {
  const row = reconcileWithOverride("force_aligned");
  assert.ok(!row.Reverse.includes("RAY"));
});

it("link/toggle force_reversed → RAY in Reverse", () => {
  const row = reconcileWithOverride("force_reversed");
  assert.ok(row.Reverse.includes("RAY"));
});
