import assert from "node:assert/strict";
import { it } from "vitest";
import { reconcileClientMatchReverse, setTeamPlugin } from "../merge/match_merge.js";

it("reconcile flags ambiguous platform and does not reverse", () => {
  const rows = [
    {
      ID: 99,
      Title: "NAVI vs Spirit",
      Matchs: { RAY: "ray1" },
      Bets: [{ Map: 0, Sources: { RAY: { BetID: "x", HomeOdds: 1.5, AwayOdds: 2.5 } } }],
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
  assert.equal(rows[0].Bets[0].Sources.RAY, undefined);
});

it("ambiguous platform keeps native Map>0 Sources for decider display", () => {
  const rows = [
    {
      ID: 99,
      Title: "NAVI vs Spirit",
      Round: 3,
      BO: 3,
      Matchs: { RAY: "ray1" },
      Bets: [
        { Map: 0, Sources: { RAY: { BetID: "full", HomeOdds: 1.5, AwayOdds: 2.5 } } },
        { Map: 3, Sources: { RAY: { BetID: "map3", HomeOdds: 1.8, AwayOdds: 2.0 } } },
      ],
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
  const bets = {
    "RAY:ray1": {
      provider: "RAY",
      matchId: "ray1",
      bets: [
        {
          SourceBetID: "full",
          Map: 0,
          SourceHomeID: "1",
          HomeOdds: 1.5,
          SourceAwayID: "2",
          AwayOdds: 2.5,
          Status: "Normal",
        },
        {
          SourceBetID: "map3",
          Map: 3,
          SourceHomeID: "1",
          HomeOdds: 1.8,
          SourceAwayID: "2",
          AwayOdds: 2.0,
          Status: "Normal",
        },
      ],
    },
  };
  const src = (p, b) => ({
    Type: p,
    BetID: String(b.SourceBetID),
    HomeID: String(b.SourceHomeID),
    AwayID: String(b.SourceAwayID),
    HomeOdds: b.HomeOdds,
    AwayOdds: b.AwayOdds,
    Status: b.Status,
  });

  reconcileClientMatchReverse(rows, matches, bets, {}, src);

  assert.equal(rows[0].Bets[0].Sources.RAY, undefined);
  assert.equal(rows[0].Bets[1].Sources.RAY?.BetID, "map3");
  assert.equal(rows[0].Bets[1].Sources.RAY?.HomeOdds, 1.8);
});

it("ambiguous platform resolved to reversed via canonical ID fallback", () => {
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
