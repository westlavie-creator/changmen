import assert from "node:assert/strict";
import test from "node:test";
import { reconcileClientMatchReverse, setTeamPlugin } from "../merge/match_merge.js";

test("reconcile flags ambiguous platform and does not reverse", () => {
  const rows = [
    {
      ID: 99,
      Title: "NAVI vs Spirit",
      Matchs: { RAY: "ray1" },
      Bets: [{ Map: 0, Sources: {} }],
    },
  ];
  const matches = {
    RAY: {
      ray1: {
        SourceMatchID: "ray1",
        Home: "NAVI",
        Away: "Team Liquid",
        HomeID: "1",
        AwayID: "2",
      },
    },
  };

  reconcileClientMatchReverse(rows, matches, {}, {}, () => null);

  assert.deepEqual(rows[0].Reverse, []);
  assert.deepEqual(rows[0].SideAlignAmbiguous, ["RAY"]);
});

test("ambiguous platform resolved to reversed via canonical ID fallback", () => {
  // Simulate: RAY aligned (1win vs VP), PB reversed with different team names
  const idMap = {
    "RAY:h1": "C1",
    "RAY:a1": "C2",
    "PB:ph": "C2",
    "PB:pa": "C1",
  };
  setTeamPlugin({
    lookupById: (platform, pid) => idMap[`${platform}:${pid}`] || null,
    lookupCanonicalName: () => null,
  });

  const rows = [
    {
      ID: 100,
      Title: "TeamAlpha vs TeamBeta",
      Matchs: { RAY: "ray1", PB: "pb1" },
      Bets: [{ Map: 0, Sources: {} }],
    },
  ];
  const matches = {
    RAY: {
      ray1: {
        SourceMatchID: "ray1",
        Home: "TeamAlpha",
        Away: "TeamBeta",
        HomeID: "h1",
        AwayID: "a1",
      },
    },
    PB: {
      pb1: {
        SourceMatchID: "pb1",
        Home: "BetaX",
        Away: "AlphaY",
        HomeID: "ph",
        AwayID: "pa",
      },
    },
  };

  reconcileClientMatchReverse(rows, matches, {}, {}, () => null);

  assert.deepEqual(rows[0].Reverse, ["PB"]);
  assert.equal(rows[0].SideAlignAmbiguous, undefined);

  setTeamPlugin(null);
});
