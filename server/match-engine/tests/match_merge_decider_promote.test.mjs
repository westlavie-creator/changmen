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

/** 决胜局 Map=0：保留 Sources，赔率 0 + Locked */
function assertMapZeroNeutralized(map0, { expectPlatforms = [] } = {}) {
  assert.ok(map0, "Map=0 row exists");
  assert.equal(map0.Status, "Locked");
  for (const platform of expectPlatforms) {
    const src = map0.Sources?.[platform];
    assert.ok(src, `${platform} source kept on Map=0`);
    assert.equal(src.Status, "Locked");
    assert.equal(src.HomeOdds, 0);
    assert.equal(src.AwayOdds, 0);
    assert.ok(src.BetID, `${platform} BetID preserved`);
  }
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

  const map0 = list[0].Bets.find((b) => b.Map === 0);
  assertMapZeroNeutralized(map0, { expectPlatforms: ["OB", "RAY"] });
  assert.equal(map5.Sources.OB?.Status, "Normal");
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

test("decider: Map=0 kept when Round=3 on BO5", () => {
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
          SourceBetID: "ob-map3",
          Map: 3,
          BetName: "[地图3]-单局-获胜",
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
      timer: [{ MatchID: "ob1", Round: 3, StartTime: Date.now() - 30_000 }],
    },
  };

  const list = buildClientMatchList({ matches, bets, timers, sourceFromBet: src });
  const map0 = list[0].Bets.find((b) => b.Map === 0);
  const map3 = list[0].Bets.find((b) => b.Map === 3);
  assert.equal(list[0].Round, 3);
  assert.equal(map0?.Sources?.OB?.Status, "Normal");
  assert.equal(map3?.Sources?.RAY, undefined, "non-decider: no promote from final to Map=3");
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

test("promote: IA full + settled Map1/2 fills Map=3 on BO3 decider (no native Map=3)", () => {
  const bets = {
    "OB:ob1": {
      provider: "OB",
      matchId: "ob1",
      bets: [
        {
          SourceBetID: "ob-map3",
          Map: 3,
          BetName: "[地图3]-单局-获胜",
          SourceHomeID: "10",
          HomeOdds: 2.586,
          SourceAwayID: "11",
          AwayOdds: 1.452,
          Status: "Normal",
        },
      ],
    },
    "IA:ia1": {
      provider: "IA",
      matchId: "ia1",
      bets: [
        {
          SourceBetID: "ia-full",
          Map: 0,
          BetName: "[全场] 获胜",
          SourceHomeID: "20",
          HomeOdds: 1.44,
          SourceAwayID: "21",
          AwayOdds: 2.626,
          Status: "Normal",
        },
        {
          SourceBetID: "ia-map1",
          Map: 1,
          BetName: "[地图1] 获胜者",
          SourceHomeID: "22",
          HomeOdds: 1.362,
          SourceAwayID: "23",
          AwayOdds: 2.982,
          Status: "Locked",
        },
        {
          SourceBetID: "ia-map2",
          Map: 2,
          BetName: "[地图2] 获胜者",
          SourceHomeID: "24",
          HomeOdds: 21,
          SourceAwayID: "25",
          AwayOdds: 1.001,
          Status: "Locked",
        },
      ],
    },
  };

  const matches = {
    OB: { ob1: { ...baseMatch("OB", "ob1", "Team A", "Team B"), BO: 3 } },
    IA: { ia1: { ...baseMatch("IA", "ia1", "Team A", "Team B"), BO: 3 } },
  };
  const timers = {
    OB: {
      provider: "OB",
      timer: [{ MatchID: "ob1", Round: 3, StartTime: Date.now() - 30_000 }],
    },
  };

  const list = buildClientMatchList({ matches, bets, timers, sourceFromBet: src });
  assert.equal(list.length, 1);
  assert.equal(list[0].Round, 3);

  const map3 = list[0].Bets.find((b) => b.Map === 3);
  assert.ok(map3, "Map=3 row exists");
  assert.equal(map3.Sources.OB?.BetID, "ob-map3");
  assert.equal(map3.Sources.IA?.BetID, "ia-full", "IA series winner promoted to Map=3");

  const map0 = list[0].Bets.find((b) => b.Map === 0);
  assertMapZeroNeutralized(map0, { expectPlatforms: ["IA"] });
});

test("promote: skips IA when native Map=3 exists", () => {
  const bets = {
    "OB:ob1": {
      provider: "OB",
      matchId: "ob1",
      bets: [
        {
          SourceBetID: "ob-map3",
          Map: 3,
          BetName: "[地图3]-单局-获胜",
          SourceHomeID: "10",
          HomeOdds: 2.586,
          SourceAwayID: "11",
          AwayOdds: 1.452,
          Status: "Normal",
        },
      ],
    },
    "IA:ia1": {
      provider: "IA",
      matchId: "ia1",
      bets: [
        {
          SourceBetID: "ia-full",
          Map: 0,
          BetName: "[全场] 获胜",
          SourceHomeID: "20",
          HomeOdds: 1.44,
          SourceAwayID: "21",
          AwayOdds: 2.626,
          Status: "Normal",
        },
        {
          SourceBetID: "ia-map3",
          Map: 3,
          BetName: "[地图3] 获胜者",
          SourceHomeID: "30",
          HomeOdds: 1.5,
          SourceAwayID: "31",
          AwayOdds: 2.4,
          Status: "Normal",
        },
      ],
    },
  };

  const matches = {
    OB: { ob1: { ...baseMatch("OB", "ob1", "Team A", "Team B"), BO: 3 } },
    IA: { ia1: { ...baseMatch("IA", "ia1", "Team A", "Team B"), BO: 3 } },
  };
  const timers = {
    OB: {
      provider: "OB",
      timer: [{ MatchID: "ob1", Round: 3, StartTime: Date.now() - 30_000 }],
    },
  };

  const list = buildClientMatchList({ matches, bets, timers, sourceFromBet: src });
  const map3 = list[0].Bets.find((b) => b.Map === 3);
  assert.equal(map3?.Sources?.IA?.BetID, "ia-map3");
});
