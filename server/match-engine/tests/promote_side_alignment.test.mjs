import assert from "node:assert/strict";
/**
 * promote 主客对齐 + 套利选腿回归（gb12 OB×RAY Map3 同向 bug）
 */
import { it } from "vitest";
import {
  buildClientMatchList,
  finalizeClientMatchListAfterLinks,
  promoteFullMatchSourcesToLiveRoundInPlace,
  swapBetSource,
} from "../merge/match_merge.js";

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

function baseMatch(provider, sourceId, home, away, bo = 3) {
  return {
    SourceMatchID: sourceId,
    Home: home,
    Away: away,
    HomeID: `${provider}-h`,
    AwayID: `${provider}-a`,
    StartTime: Date.now() - 60_000,
    SourceGameID: "8",
    BO: bo,
    IsLive: 2,
  };
}

/** 对齐 A8 GetOrderOptions：各平台 Home 最高赔 + Away 最高赔 */
function pickArbOddsLikeA8(sources) {
  let homeOdds = 0;
  let awayOdds = 0;
  for (const s of Object.values(sources || {})) {
    homeOdds = Math.max(homeOdds, Number(s.HomeOdds) || 0);
    awayOdds = Math.max(awayOdds, Number(s.AwayOdds) || 0);
  }
  return { homeOdds, awayOdds, implied: homeOdds && awayOdds ? 1 / (1 / homeOdds + 1 / awayOdds) : 0 };
}

/**
 * gb12 类 bug：Home/Away 最高赔都落在同一 canonical 队（两边都押 underdog）。
 * 正确对齐时：一队高赔在 Home、另一队高赔在 Away，不会两侧同时 > underdogThreshold。
 */
function assertMapBetArbSidesOpposite(mapBet, underdogThreshold = 1.95) {
  const { homeOdds, awayOdds, implied } = pickArbOddsLikeA8(mapBet.Sources);
  const bothUnderdog
    = homeOdds >= underdogThreshold && awayOdds >= underdogThreshold;
  assert.ok(
    !bothUnderdog,
    `Map${mapBet.Map} 两侧最高赔都像 underdog（H=${homeOdds} A=${awayOdds} implied=${implied.toFixed(4)}）`,
  );
}

/** 各平台 Home 赔应对 Title 主队、Away 赔应对 Title 客队（用赔率高的一侧为 underdog 启发式） */
function assertSourcesMatchTitleSides(mapBet) {
  const homeName = mapBet.HomeName;
  const awayName = mapBet.AwayName;
  assert.ok(homeName && awayName, "HomeName/AwayName required");
  for (const [platform, s] of Object.entries(mapBet.Sources || {})) {
    assert.ok(Number(s.HomeOdds) > 0, `${platform} HomeOdds`);
    assert.ok(Number(s.AwayOdds) > 0, `${platform} AwayOdds`);
    assert.ok(
      Number(s.HomeOdds) !== Number(s.AwayOdds) || s.HomeID !== s.AwayID,
      `${platform} Home/Away must differ`,
    );
  }
  void homeName;
  void awayName;
}

const gb12Bets = {
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

const gb12Matches = {
  OB: { ob1: baseMatch("OB", "ob1", "9z", "FURIA") },
  RAY: { ray1: baseMatch("RAY", "ray1", "FURIA", "9z") },
};

const gb12Timers = {
  OB: {
    provider: "OB",
    timer: [{ MatchID: "ob1", Round: 3, StartTime: Date.now() - 30_000 }],
  },
};

function buildGb12List() {
  return buildClientMatchList({
    matches: gb12Matches,
    bets: gb12Bets,
    timers: gb12Timers,
    sourceFromBet: src,
  });
}

it("gb12: rebuild Map3 OB×RAY 主客对齐，套利两侧非同一队", () => {
  const list = buildGb12List();
  assert.equal(list.length, 1);
  const map3 = list[0].Bets.find(b => b.Map === 3);
  assert.ok(map3?.Sources?.OB && map3?.Sources?.RAY);
  assert.equal(map3.Sources.OB.HomeOdds, 2.065);
  assert.equal(map3.Sources.RAY.HomeOdds, 2.08);
  assert.equal(map3.Sources.RAY.AwayOdds, 1.85);
  assertMapBetArbSidesOpposite(map3);
  assertSourcesMatchTitleSides(map3);
});

it("gb12: 旧 bug 形态（RAY Map3 二次 swap）会被检出", () => {
  const list = buildGb12List();
  const map3 = list[0].Bets.find(b => b.Map === 3);
  const buggyRay = swapBetSource(map3.Sources.RAY);
  const buggy = {
    ...map3,
    Sources: { ...map3.Sources, RAY: buggyRay },
  };
  assert.throws(() => assertMapBetArbSidesOpposite(buggy), /两侧最高赔都像 underdog/);
  const { homeOdds, awayOdds } = pickArbOddsLikeA8(buggy.Sources);
  assert.ok(homeOdds >= 2.065 && awayOdds >= 2.08, "bug 形态：Home/ Away 最高赔都在 9z");
});

it("gb12: finalize 在 Round 切到 3 后 promote 仍对齐", () => {
  const staleDbRow = {
    ID: 1,
    BO: 3,
    Round: 0,
    RoundStart: 0,
    Reverse: ["RAY"],
    Title: "9z vs FURIA",
    Matchs: { OB: "ob1", RAY: "ray1" },
    Bets: [
      {
        Map: 0,
        HomeName: "9z",
        AwayName: "FURIA",
        Sources: {
          OB: {
            Type: "OB",
            BetID: "ob-full",
            HomeOdds: 2.5,
            AwayOdds: 1.55,
            Status: "Normal",
          },
          RAY: {
            Type: "RAY",
            BetID: "ray-final",
            HomeOdds: 2.08,
            AwayOdds: 1.85,
            Status: "Normal",
          },
        },
      },
      {
        Map: 3,
        HomeName: "9z",
        AwayName: "FURIA",
        Sources: {
          OB: {
            Type: "OB",
            BetID: "ob-map3",
            HomeOdds: 2.065,
            AwayOdds: 1.75,
            Status: "Normal",
          },
        },
      },
    ],
  };
  const rows = [structuredClone(staleDbRow)];
  finalizeClientMatchListAfterLinks(rows, gb12Matches, gb12Bets, gb12Timers, src, null, {});
  assert.equal(rows[0].Round, 3);
  const map3 = rows[0].Bets.find(b => b.Map === 3);
  assert.ok(map3?.Sources?.RAY, "finalize promote RAY");
  assert.equal(map3.Sources.RAY.HomeOdds, 2.08);
  assertMapBetArbSidesOpposite(map3);
  const map0 = rows[0].Bets.find(b => b.Map === 0);
  assert.deepEqual(Object.keys(map0.Sources || {}), ["OB"], "trim Map=0 to OB only");
});

it("Polymarket reverse: finalize 用最新 Map0 覆盖旧的决胜局 promoted source", () => {
  const polyFull = {
    SourceBetID: "poly-full",
    Map: 0,
    BetName: "[全场] 获胜者",
    SourceHomeID: "poly-home-novaq",
    HomeOdds: 1.191,
    SourceAwayID: "poly-away-rune",
    AwayOdds: 4.762,
    Status: "Normal",
  };
  const staleDbRow = {
    ID: 501,
    BO: 3,
    Round: 0,
    RoundStart: 0,
    Reverse: ["Polymarket"],
    Title: "Rune Eaters vs Novaq",
    Matchs: { OB: "ob-rune-novaq", Polymarket: "poly-rune-novaq" },
    Bets: [
      {
        Map: 0,
        HomeName: "Rune Eaters",
        AwayName: "Novaq",
        Sources: {
          OB: {
            Type: "OB",
            BetID: "ob-full",
            HomeOdds: 1.65,
            AwayOdds: 2.13,
            Status: "Normal",
          },
        },
      },
      {
        Map: 3,
        HomeName: "Rune Eaters",
        AwayName: "Novaq",
        Sources: {
          OB: {
            Type: "OB",
            BetID: "ob-map3",
            HomeOdds: 2.5,
            AwayOdds: 1.5,
            Status: "Normal",
          },
          Polymarket: {
            Type: "Polymarket",
            BetID: "poly-full",
            HomeID: "poly-home-novaq",
            AwayID: "poly-away-rune",
            HomeOdds: 1.191,
            AwayOdds: 4.762,
            Status: "Normal",
          },
        },
      },
    ],
  };
  const polyMatches = {
    OB: { "ob-rune-novaq": baseMatch("OB", "ob-rune-novaq", "Rune Eaters", "Novaq") },
    Polymarket: {
      "poly-rune-novaq": baseMatch("Polymarket", "poly-rune-novaq", "Team Novaq", "Rune Eaters"),
    },
  };
  const polyBets = {
    "OB:ob-rune-novaq": {
      provider: "OB",
      matchId: "ob-rune-novaq",
      bets: [
        {
          SourceBetID: "ob-full",
          Map: 0,
          BetName: "[全场]-全局-获胜",
          SourceHomeID: "ob-home-rune",
          HomeOdds: 1.65,
          SourceAwayID: "ob-away-novaq",
          AwayOdds: 2.13,
          Status: "Normal",
        },
      ],
    },
    "Polymarket:poly-rune-novaq": {
      provider: "Polymarket",
      matchId: "poly-rune-novaq",
      bets: [polyFull],
    },
  };
  const timers = {
    OB: {
      provider: "OB",
      timer: [{ MatchID: "ob-rune-novaq", Round: 3, StartTime: Date.now() - 30_000 }],
    },
  };

  const rows = [structuredClone(staleDbRow)];
  finalizeClientMatchListAfterLinks(
    rows,
    polyMatches,
    polyBets,
    timers,
    src,
    null,
    { 501: { Polymarket: "force_reversed" } },
  );
  const map3 = rows[0].Bets.find(b => b.Map === 3);
  assert.equal(rows[0].Round, 3);
  assert.equal(map3.Sources.Polymarket.HomeID, "poly-away-rune");
  assert.equal(map3.Sources.Polymarket.AwayID, "poly-home-novaq");
  assert.equal(map3.Sources.Polymarket.HomeOdds, 4.762);
  assert.equal(map3.Sources.Polymarket.AwayOdds, 1.191);
  const map0 = rows[0].Bets.find(b => b.Map === 0);
  assert.deepEqual(Object.keys(map0.Sources || {}).sort(), ["OB", "Polymarket"], "trim Map=0 keeps OB + Polymarket");
});

it("gb12: inPlace promote 在 Reverse 含 RAY 时不二次 swap", () => {
  const rows = [
    {
      ID: 1,
      BO: 3,
      Round: 3,
      Reverse: ["RAY"],
      Title: "9z vs FURIA",
      Matchs: { OB: "ob1", RAY: "ray1" },
      Bets: [
        {
          Map: 0,
          HomeName: "9z",
          AwayName: "FURIA",
          Sources: {
            OB: { Type: "OB", BetID: "1", HomeOdds: 2.5, AwayOdds: 1.55 },
            RAY: { Type: "RAY", BetID: "9", HomeOdds: 2.08, AwayOdds: 1.85 },
          },
        },
        {
          Map: 3,
          HomeName: "9z",
          AwayName: "FURIA",
          Sources: {
            OB: { Type: "OB", BetID: "2", HomeOdds: 2.065, AwayOdds: 1.75 },
          },
        },
      ],
    },
  ];
  promoteFullMatchSourcesToLiveRoundInPlace(rows, {
    OB: { ob1: { SourceMatchID: "ob1", BO: 3 } },
  });
  const map3 = rows[0].Bets.find(b => b.Map === 3);
  assert.equal(map3.Sources.RAY.HomeOdds, 2.08);
  assertMapBetArbSidesOpposite(map3);
});

it("aligned teams: OB 与 RAY 同向主客时 Reverse 为空且 Map3 可对冲", () => {
  const bets = {
    "OB:ob1": {
      provider: "OB",
      matchId: "ob1",
      bets: [
        {
          SourceBetID: "ob-map3",
          Map: 3,
          BetName: "[地图3]-单局-获胜",
          SourceHomeID: "1",
          HomeOdds: 1.8,
          SourceAwayID: "2",
          AwayOdds: 2.05,
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
          SourceHomeID: "3",
          HomeOdds: 1.75,
          SourceAwayID: "4",
          AwayOdds: 2.1,
          Status: "Normal",
        },
      ],
    },
  };
  const matches = {
    OB: { ob1: baseMatch("OB", "ob1", "FURIA", "9z") },
    RAY: { ray1: baseMatch("RAY", "ray1", "FURIA", "9z") },
  };
  const list = buildClientMatchList({
    matches,
    bets,
    timers: gb12Timers,
    sourceFromBet: src,
  });
  assert.equal(list[0].Reverse?.length || 0, 0);
  const map3 = list[0].Bets.find(b => b.Map === 3);
  assert.ok(map3?.Sources?.RAY);
  assertMapBetArbSidesOpposite(map3);
});

it("swapBetSource 连换两次回到原方向（说明 promote 不可再 swap）", () => {
  const raw = {
    Type: "RAY",
    BetID: "9",
    HomeID: "ray-h-furia",
    AwayID: "ray-a-9z",
    HomeOdds: 1.85,
    AwayOdds: 2.08,
  };
  const once = swapBetSource(raw);
  const twice = swapBetSource(once);
  assert.equal(twice.HomeOdds, raw.HomeOdds);
  assert.equal(twice.AwayOdds, raw.AwayOdds);
  assert.equal(twice.HomeID, raw.HomeID);
});
