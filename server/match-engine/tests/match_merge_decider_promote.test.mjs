import assert from "node:assert/strict";
import test from "node:test";
import { buildClientMatchList } from "../merge/match_merge.js";

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
    StartTime: Date.now() - 60_000,
    SourceGameID: "8",
    BO: 5,
    IsLive: 2,
  };
}

/** 决胜局 Map=0：[A8 可证实] 仅保留 OB */
function assertMapZeroObOnly(map0) {
  assert.ok(map0, "Map=0 row exists");
  assert.deepEqual(Object.keys(map0.Sources || {}).sort(), ["OB"]);
  assert.ok(map0.Sources.OB?.BetID, "OB BetID preserved");
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

  const map5 = list[0].Bets.find(b => b.Map === 5);
  assert.ok(map5, "Map=5 row exists");
  assert.equal(map5.Sources.OB?.BetID, "ob-map5");
  assert.equal(map5.Sources.RAY?.BetID, "ray-final");
  assert.equal(list[0].Round, 5);

  const map0 = list[0].Bets.find(b => b.Map === 0);
  assertMapZeroObOnly(map0);
  assert.equal(map0.Sources.OB.HomeOdds, 1.9);
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
  const map5 = list[0].Bets.find(b => b.Map === 5);
  assert.equal(map5.Sources.RAY?.BetID, "ray-map5");
});

test("live Round=3 on BO5: Map=0 OB-only, no promote to Map=3", () => {
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
  const map0 = list[0].Bets.find(b => b.Map === 0);
  const map3 = list[0].Bets.find(b => b.Map === 3);
  assert.equal(list[0].Round, 3);
  assertMapZeroObOnly(map0);
  assert.equal(map0.Sources.RAY, undefined);
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
  const map5 = list[0].Bets.find(b => b.Map === 5);
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
          SourceBetID: "ob-full",
          Map: 0,
          BetName: "[全场]-全局-获胜",
          SourceHomeID: "1",
          HomeOdds: 1.3,
          SourceAwayID: "2",
          AwayOdds: 3.33,
          Status: "Normal",
        },
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

  const map3 = list[0].Bets.find(b => b.Map === 3);
  assert.ok(map3, "Map=3 row exists");
  assert.equal(map3.Sources.OB?.BetID, "ob-map3");
  assert.equal(map3.Sources.IA?.BetID, "ia-full", "IA series winner promoted to Map=3");

  const map0 = list[0].Bets.find(b => b.Map === 0);
  assertMapZeroObOnly(map0);
  assert.equal(map0.Sources.OB.BetID, "ob-full");
  assert.equal(map0.Sources.IA, undefined, "IA trimmed from Map=0 after promote");
  assert.equal(map0.InitialHomeOdds, 1.44);
  assert.equal(map0.InitialAwayOdds, 3.33);
});

test("decider: Map=0 OB-only when Round=BO (A8 95694 shape)", () => {
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
          HomeOdds: 1.3,
          SourceAwayID: "2",
          AwayOdds: 3.33,
          Status: "Normal",
        },
        {
          SourceBetID: "ob-map3",
          Map: 3,
          BetName: "[地图3]-单局-获胜",
          SourceHomeID: "3",
          HomeOdds: 1.84,
          SourceAwayID: "4",
          AwayOdds: 1.9,
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
          HomeOdds: 2.0,
          SourceAwayID: "6",
          AwayOdds: 1.8,
          Status: "Normal",
        },
        {
          SourceBetID: "ray-map3",
          Map: 3,
          BetName: "[地图3] 获胜者",
          SourceHomeID: "7",
          HomeOdds: 1.87,
          SourceAwayID: "8",
          AwayOdds: 1.87,
          Status: "Normal",
        },
      ],
    },
  };

  const matches = {
    OB: { ob1: { ...baseMatch("OB", "ob1", "Team A", "Team B"), BO: 3 } },
    RAY: { ray1: { ...baseMatch("RAY", "ray1", "Team A", "Team B"), BO: 3 } },
  };
  const timers = {
    OB: {
      provider: "OB",
      timer: [{ MatchID: "ob1", Round: 3, StartTime: Date.now() - 30_000 }],
    },
  };

  const list = buildClientMatchList({ matches, bets, timers, sourceFromBet: src });
  const map0 = list[0].Bets.find(b => b.Map === 0);
  const map3 = list[0].Bets.find(b => b.Map === 3);

  assertMapZeroObOnly(map0);
  assert.equal(map0.Sources.IA, undefined);
  assert.equal(map3.Sources.OB?.BetID, "ob-map3");
  assert.equal(map3.Sources.RAY?.BetID, "ray-map3");
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
  const map3 = list[0].Bets.find(b => b.Map === 3);
  assert.equal(map3?.Sources?.IA?.BetID, "ia-map3");
});

test("promote: BO3 decider aligns RAY final to Title when OB home/away reversed vs RAY", () => {
  const bets = {
    "OB:ob1": {
      provider: "OB",
      matchId: "ob1",
      bets: [
        {
          SourceBetID: "ob-full",
          Map: 0,
          BetName: "[全场]-全局-获胜",
          SourceHomeID: "ob-h-9z",
          HomeOdds: 2.5,
          SourceAwayID: "ob-a-furia",
          AwayOdds: 1.55,
          Status: "Normal",
        },
        {
          SourceBetID: "ob-map3",
          Map: 3,
          BetName: "[地图3]-单局-获胜",
          SourceHomeID: "ob-m3-h-9z",
          HomeOdds: 2.065,
          SourceAwayID: "ob-m3-a-furia",
          AwayOdds: 1.75,
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
          SourceHomeID: "ray-h-furia",
          HomeOdds: 1.85,
          SourceAwayID: "ray-a-9z",
          AwayOdds: 2.08,
          Status: "Normal",
        },
      ],
    },
  };

  const matches = {
    OB: {
      ob1: {
        ...baseMatch("OB", "ob1", "9z", "FURIA"),
        BO: 3,
      },
    },
    RAY: {
      ray1: {
        ...baseMatch("RAY", "ray1", "FURIA", "9z"),
        BO: 3,
      },
    },
  };
  const timers = {
    OB: {
      provider: "OB",
      timer: [{ MatchID: "ob1", Round: 3, StartTime: Date.now() - 30_000 }],
    },
  };

  const list = buildClientMatchList({ matches, bets, timers, sourceFromBet: src });
  assert.equal(list.length, 1);
  assert.equal(list[0].Title, "9z vs FURIA");
  assert.ok(list[0].Reverse.includes("RAY"));
  assert.ok(!list[0].Reverse.includes("OB"));

  const map3 = list[0].Bets.find(b => b.Map === 3);
  assert.ok(map3?.Sources?.OB, "OB native map3");
  assert.ok(map3?.Sources?.RAY, "RAY final promoted to map3");

  // Title canonical：Home=9z，Away=FURIA；两平台 Home 赔均为 9z、Away 赔均为 FURIA
  assert.equal(map3.Sources.OB.HomeOdds, 2.065);
  assert.equal(map3.Sources.OB.AwayOdds, 1.75);
  assert.equal(map3.Sources.RAY.HomeOdds, 2.08);
  assert.equal(map3.Sources.RAY.AwayOdds, 1.85);
  assert.equal(map3.HomeName, "9z");
  assert.equal(map3.AwayName, "FURIA");
});

test("live Round=2, OB no Map=0: keep Map=0 row with empty Sources and Initial odds", () => {
  const bets = {
    "OB:ob1": {
      provider: "OB",
      matchId: "ob1",
      bets: [
        {
          SourceBetID: "ob-map1",
          Map: 1,
          BetName: "[地图1]-单局-获胜",
          SourceHomeID: "1",
          HomeOdds: 1.001,
          SourceAwayID: "2",
          AwayOdds: 13,
          Status: "Locked",
        },
        {
          SourceBetID: "ob-map2",
          Map: 2,
          BetName: "[地图2]-单局-获胜",
          SourceHomeID: "3",
          HomeOdds: 1.1,
          SourceAwayID: "4",
          AwayOdds: 6,
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
          SourceHomeID: "5",
          HomeOdds: 1.02,
          SourceAwayID: "6",
          AwayOdds: 11.22,
          Status: "Normal",
        },
        {
          SourceBetID: "ia-map2",
          Map: 2,
          BetName: "[地图2] 获胜者",
          SourceHomeID: "7",
          HomeOdds: 1.13,
          SourceAwayID: "8",
          AwayOdds: 5.418,
          Status: "Normal",
        },
      ],
    },
    "RAY:ray1": {
      provider: "RAY",
      matchId: "ray1",
      bets: [
        {
          SourceBetID: "ray-full",
          Map: 0,
          BetName: "[全场] 获胜者",
          SourceHomeID: "9",
          HomeOdds: 1.01,
          SourceAwayID: "10",
          AwayOdds: 12.52,
          Status: "Normal",
        },
        {
          SourceBetID: "ray-map2",
          Map: 2,
          BetName: "[地图2] 获胜者",
          SourceHomeID: "11",
          HomeOdds: 1.18,
          SourceAwayID: "12",
          AwayOdds: 4.49,
          Status: "Normal",
        },
      ],
    },
  };

  const matches = {
    OB: { ob1: baseMatch("OB", "ob1", "PTime", "Estar Backs") },
    IA: { ia1: baseMatch("IA", "ia1", "PTime", "Estar Backs") },
    RAY: { ray1: baseMatch("RAY", "ray1", "PTime", "Estar Backs") },
  };
  const timers = {
    OB: {
      provider: "OB",
      timer: [{ MatchID: "ob1", Round: 2, StartTime: Date.now() - 30_000 }],
    },
  };

  const list = buildClientMatchList({ matches, bets, timers, sourceFromBet: src });
  assert.equal(list.length, 1);
  assert.equal(list[0].Round, 2);

  const map0 = list[0].Bets.find(b => b.Map === 0);
  assert.ok(map0, "Map=0 row kept when OB has no full-match market");
  assert.deepEqual(map0.Sources, {});
  assert.equal(map0.InitialHomeOdds, 1.02);
  assert.equal(map0.InitialAwayOdds, 12.52);

  const map2 = list[0].Bets.find(b => b.Map === 2);
  assert.ok(map2?.Sources?.OB);
  assert.ok(map2?.Sources?.IA);
  assert.ok(map2?.Sources?.RAY);
  assert.deepEqual(list[0].Bets.map(b => b.Map), [0, 1, 2]);
});
