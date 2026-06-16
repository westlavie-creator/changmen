import test from "node:test";
import assert from "node:assert/strict";
import { buildClientMatchList } from "../merge/match_merge.js";

const src = (p, b) => ({
  Type: p,
  BetID: String(b.SourceBetID),
  HomeID: String(b.SourceHomeID),
  AwayID: String(b.SourceAwayID),
  HomeOdds: b.HomeOdds,
  AwayOdds: b.AwayOdds,
  Status: b.Status,
});

function baseMatch(provider, sourceId, home, away) {
  return {
    SourceMatchID: sourceId,
    Home: home,
    Away: away,
    HomeID: `${provider}-h`,
    AwayID: `${provider}-a`,
    StartTime: Date.now() - 60_000,
    SourceGameID: "8",
    BO: 5,
    IsLive: 2,
  };
}

test("promote: RAY final-only fills Map=5 when Round=5 (OB has native map5)", () => {
  const bets = {
    "OB:ob1": {
      provider: "OB",
      matchId: "ob1",
      bets: [
        {
          SourceBetID: "ob-full",
          Map: 0,
          BetName: "[全场]-全局-获胜",
          SourceHomeID: "1",
          HomeOdds: 1.9,
          SourceAwayID: "2",
          AwayOdds: 1.9,
          Status: "Normal",
        },
        {
          SourceBetID: "ob-map5",
          Map: 5,
          BetName: "[地图5]-单局-获胜",
          SourceHomeID: "3",
          HomeOdds: 2.1,
          SourceAwayID: "4",
          AwayOdds: 1.7,
          Status: "Normal",
        },
      ],
    },
    "RAY:ray1": {
      provider: "RAY",
      matchId: "ray1",
      bets: [
        {
          SourceBetID: "ray-final",
          Map: 0,
          BetName: "[全场] 获胜者",
          SourceHomeID: "5",
          HomeOdds: 2.05,
          SourceAwayID: "6",
          AwayOdds: 1.75,
          Status: "Normal",
        },
      ],
    },
  };

  const matches = {
    OB: { ob1: baseMatch("OB", "ob1", "Team A", "Team B") },
    RAY: { ray1: baseMatch("RAY", "ray1", "Team A", "Team B") },
  };
  const timers = {
    OB: {
      provider: "OB",
      timer: [{ MatchID: "ob1", Round: 5, StartTime: Date.now() - 30_000 }],
    },
  };

  const list = buildClientMatchList({
    matches,
    bets,
    timers,
    sourceFromBet: src,
  });
  assert.equal(list.length, 1);

  const map5 = list[0].Bets.find((b) => b.Map === 5);
  assert.ok(map5, "Map=5 row exists");
  assert.equal(map5.Sources.OB?.BetID, "ob-map5");
  assert.equal(map5.Sources.RAY?.BetID, "ray-final");
  assert.equal(list[0].Round, 5);
});

test("promote: skips RAY when native Map=5 exists", () => {
  const bets = {
    "OB:ob1": {
      provider: "OB",
      matchId: "ob1",
      bets: [
        {
          SourceBetID: "ob-map5",
          Map: 5,
          BetName: "[地图5]-单局-获胜",
          SourceHomeID: "3",
          HomeOdds: 2.1,
          SourceAwayID: "4",
          AwayOdds: 1.7,
          Status: "Normal",
        },
      ],
    },
    "RAY:ray1": {
      provider: "RAY",
      matchId: "ray1",
      bets: [
        {
          SourceBetID: "ray-final",
          Map: 0,
          BetName: "[全场] 获胜者",
          SourceHomeID: "5",
          HomeOdds: 2.05,
          SourceAwayID: "6",
          AwayOdds: 1.75,
          Status: "Normal",
        },
        {
          SourceBetID: "ray-map5",
          Map: 5,
          BetName: "[地图5] 获胜者",
          SourceHomeID: "7",
          HomeOdds: 2.2,
          SourceAwayID: "8",
          AwayOdds: 1.65,
          Status: "Normal",
        },
      ],
    },
  };

  const matches = {
    OB: { ob1: baseMatch("OB", "ob1", "Team A", "Team B") },
    RAY: { ray1: baseMatch("RAY", "ray1", "Team A", "Team B") },
  };
  const timers = {
    OB: {
      provider: "OB",
      timer: [{ MatchID: "ob1", Round: 5, StartTime: Date.now() - 30_000 }],
    },
  };

  const list = buildClientMatchList({ matches, bets, timers, sourceFromBet: src });
  const map5 = list[0].Bets.find((b) => b.Map === 5);
  assert.equal(map5.Sources.RAY?.BetID, "ray-map5");
});

test("promote: no-op when Round=0", () => {
  const bets = {
    "OB:ob1": {
      provider: "OB",
      matchId: "ob1",
      bets: [
        {
          SourceBetID: "ob-map5",
          Map: 5,
          BetName: "[地图5]-单局-获胜",
          SourceHomeID: "3",
          HomeOdds: 2.1,
          SourceAwayID: "4",
          AwayOdds: 1.7,
          Status: "Normal",
        },
      ],
    },
    "RAY:ray1": {
      provider: "RAY",
      matchId: "ray1",
      bets: [
        {
          SourceBetID: "ray-final",
          Map: 0,
          BetName: "[全场] 获胜者",
          SourceHomeID: "5",
          HomeOdds: 2.05,
          SourceAwayID: "6",
          AwayOdds: 1.75,
          Status: "Normal",
        },
      ],
    },
  };

  const matches = {
    OB: { ob1: { ...baseMatch("OB", "ob1", "Team A", "Team B"), IsLive: 1 } },
    RAY: { ray1: baseMatch("RAY", "ray1", "Team A", "Team B") },
  };
  const timers = { OB: { provider: "OB", timer: [] } };

  const list = buildClientMatchList({ matches, bets, timers, sourceFromBet: src });
  const map5 = list[0].Bets.find((b) => b.Map === 5);
  assert.equal(list[0].Round, 0);
  assert.equal(map5?.Sources?.RAY, undefined);
});
