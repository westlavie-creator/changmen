import assert from "node:assert/strict";
/**
 * 手动反转 = client_match_platform_overrides；identity team maps 不变。
 */
import { it } from "vitest";
import { reconcileClientMatchReverse, setTeamPlugin } from "../merge/match_merge.js";

const SUBTOP = "Subtop De France";
const JULIE = "Julie&Cie";
const GB_JULIE = "C-julie";
const GB_SUBTOP = "C-subtop";
const CM_ID = 720;

const subtopMatches = {
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

const subtopBets = {
  "RAY:38403021": {
    provider: "RAY",
    matchId: "38403021",
    bets: [
      {
        SourceBetID: "ray-final",
        Map: 0,
        BetName: "[全场] 获胜者",
        SourceHomeID: "ray-h",
        HomeOdds: 1.97,
        SourceAwayID: "ray-a",
        AwayOdds: 1.85,
        Status: "Normal",
      },
    ],
  },
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

function setRayIdentityMaps() {
  setTeamPlugin({
    lookupById: (platform, pid) => ({
      "RAY:ray-h": GB_SUBTOP,
      "RAY:ray-a": GB_JULIE,
    })[`${platform}:${pid}`] || null,
    lookupCanonicalName: (gb) => (gb === GB_JULIE ? JULIE : gb === GB_SUBTOP ? SUBTOP : null),
    lookupGbTeamIdByNormalizedName: (norm) => {
      const n = String(norm || "");
      if (n.includes("julie"))
        return GB_JULIE;
      if (n.includes("subtop"))
        return GB_SUBTOP;
      return null;
    },
  });
}

function reconcileRayRow(platformSideOverrides) {
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
  reconcileClientMatchReverse(rows, subtopMatches, subtopBets, {}, src, platformSideOverrides);
  return rows[0];
}

it("auto: native RAY reversed vs Title → RAY in Reverse", () => {
  setRayIdentityMaps();
  const row = reconcileRayRow();
  assert.ok(row.Reverse.includes("RAY"));
  setTeamPlugin(null);
});

it("override force_aligned cancels auto reverse", () => {
  setRayIdentityMaps();
  const row = reconcileRayRow({ [CM_ID]: { RAY: "force_aligned" } });
  assert.ok(!row.Reverse.includes("RAY"));
  setTeamPlugin(null);
});

it("override force_reversed marks reverse even when auto aligned", () => {
  setRayIdentityMaps();
  const rows = [
    {
      ID: CM_ID,
      Title: `${SUBTOP} vs ${JULIE}`,
      HomeGbTeamId: GB_SUBTOP,
      AwayGbTeamId: GB_JULIE,
      Matchs: { RAY: "38403021" },
      Bets: [{ Map: 0, Sources: {} }],
    },
  ];
  reconcileClientMatchReverse(
    rows,
    subtopMatches,
    subtopBets,
    {},
    src,
    { [CM_ID]: { RAY: "force_reversed" } },
  );
  assert.ok(rows[0].Reverse.includes("RAY"));
  setTeamPlugin(null);
});
