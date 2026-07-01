import assert from "node:assert/strict";
/**
 * A8 #96354 PuckChamp vs Nemiga：少数平台在 Reverse，Sources 均已 canonical 对齐。
 * Reverse 是派生字段；前端只消费 Sources，不二次 swap。
 */
import { it } from "vitest";
import { reconcileClientMatchReverse, setTeamPlugin } from "../merge/match_merge.js";

const PUCK = "PuckChamp";
const NEMIGA = "Nemiga Gaming";
const GB_PUCK = "C-puck";
const GB_NEMIGA = "C-nemiga";
const CM_ID = 96354;

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

function baseMatch(provider, sourceId, home, away) {
  return {
    SourceMatchID: sourceId,
    Home: home,
    Away: away,
    HomeID: `${provider}-h`,
    AwayID: `${provider}-a`,
    SourceGameID: "2",
    BO: 3,
  };
}

const puckMatches = {
  OB: { ob1: baseMatch("OB", "ob1", PUCK, NEMIGA) },
  IM: { im1: baseMatch("IM", "im1", NEMIGA, PUCK) },
  XBet: { xb1: baseMatch("XBet", "xb1", NEMIGA, PUCK) },
  RAY: { ray1: baseMatch("RAY", "ray1", PUCK, NEMIGA) },
};

const puckBets = {
  "OB:ob1": {
    provider: "OB",
    matchId: "ob1",
    bets: [{
      SourceBetID: "ob-m0",
      Map: 0,
      BetName: "[全场]-全局-获胜",
      SourceHomeID: "ob-h",
      HomeOdds: 11.0,
      SourceAwayID: "ob-a",
      AwayOdds: 1.015,
      Status: "Normal",
    }],
  },
  "IM:im1": {
    provider: "IM",
    matchId: "im1",
    bets: [{
      SourceBetID: "im-m0",
      Map: 0,
      BetName: "[全场] 获胜",
      SourceHomeID: "im-h",
      HomeOdds: 1.05,
      SourceAwayID: "im-a",
      AwayOdds: 7.04,
      Status: "Normal",
    }],
  },
  "XBet:xb1": {
    provider: "XBet",
    matchId: "xb1",
    bets: [{
      SourceBetID: "xb-m0",
      Map: 0,
      BetName: "[全场] 获胜",
      SourceHomeID: "xb-h",
      HomeOdds: 1.06,
      SourceAwayID: "xb-a",
      AwayOdds: 7.1,
      Status: "Normal",
    }],
  },
  "RAY:ray1": {
    provider: "RAY",
    matchId: "ray1",
    bets: [{
      SourceBetID: "ray-m0",
      Map: 0,
      BetName: "[全场] 获胜者",
      SourceHomeID: "ray-h",
      HomeOdds: 10.5,
      SourceAwayID: "ray-a",
      AwayOdds: 1.02,
      Status: "Normal",
    }],
  },
};

function setPuckPlugin() {
  const idMap = {
    "OB:ob-h": GB_PUCK,
    "OB:ob-a": GB_NEMIGA,
    "IM:im-h": GB_NEMIGA,
    "IM:im-a": GB_PUCK,
    "XBet:xb-h": GB_NEMIGA,
    "XBet:xb-a": GB_PUCK,
    "RAY:ray-h": GB_PUCK,
    "RAY:ray-a": GB_NEMIGA,
  };
  setTeamPlugin({
    lookupById: (platform, pid) => idMap[`${platform}:${pid}`] || null,
    lookupCanonicalName: (gb) => (gb === GB_PUCK ? PUCK : gb === GB_NEMIGA ? NEMIGA : null),
  });
}

function reconcilePuckRow(staleReverse) {
  const rows = [
    {
      ID: CM_ID,
      Title: `${PUCK} vs ${NEMIGA}`,
      HomeGbTeamId: GB_PUCK,
      AwayGbTeamId: GB_NEMIGA,
      Matchs: { OB: "ob1", IM: "im1", XBet: "xb1", RAY: "ray1" },
      Reverse: staleReverse,
      Bets: [{ Map: 0, HomeName: PUCK, AwayName: NEMIGA, Sources: {} }],
    },
  ];
  reconcileClientMatchReverse(rows, puckMatches, puckBets, {}, src);
  return rows[0];
}

function reverseSet(row) {
  return new Set(row.Reverse || []);
}

it("96354: partial Reverse [IM, XBet] while Sources canonical-aligned", () => {
  setPuckPlugin();
  const row = reconcilePuckRow(["RAY", "OB"]);

  assert.equal(row.Title, `${PUCK} vs ${NEMIGA}`);
  assert.deepEqual([...reverseSet(row)].sort(), ["IM", "XBet"]);
  assert.ok(!reverseSet(row).has("OB"));
  assert.ok(!reverseSet(row).has("RAY"));

  const bet = row.Bets[0];
  assert.equal(bet.Sources.OB.HomeOdds, 11.0);
  assert.equal(bet.Sources.OB.AwayOdds, 1.015);
  assert.equal(bet.Sources.RAY.HomeOdds, 10.5);

  assert.equal(bet.Sources.IM.HomeOdds, 7.04, "IM swapped: PuckChamp odds on canonical Home");
  assert.equal(bet.Sources.IM.AwayOdds, 1.05);
  assert.equal(bet.Sources.IM.HomeID, "im-a");

  assert.equal(bet.Sources.XBet.HomeOdds, 7.1);
  assert.equal(bet.Sources.XBet.AwayOdds, 1.06);
  assert.equal(bet.Sources.XBet.HomeID, "xb-a");

  setTeamPlugin(null);
});

it("96354: stale DB Reverse is ignored each reconcile round", () => {
  setPuckPlugin();
  const row = reconcilePuckRow(["OB", "RAY", "IA"]);
  assert.deepEqual([...reverseSet(row)].sort(), ["IM", "XBet"]);
  setTeamPlugin(null);
});
