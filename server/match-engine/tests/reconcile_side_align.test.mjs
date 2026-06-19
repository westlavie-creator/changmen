import test from "node:test";
import assert from "node:assert/strict";
import { reconcileClientMatchReverse } from "../merge/match_merge.js";

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
