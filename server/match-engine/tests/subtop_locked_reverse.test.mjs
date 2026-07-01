import assert from "node:assert/strict";
/**
 * GB12 Subtop×Julie：锁定 canonical 主客后 OB 加入不翻转 Title，RAY 保持正向、OB 反转。
 */
import { it } from "vitest";
import {
  applyManualMatchLinks,
  buildClientMatchList,
  reconcileClientMatchReverse,
  setTeamPlugin,
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

function baseMatch(provider, sourceId, home, away) {
  return {
    SourceMatchID: sourceId,
    Home: home,
    Away: away,
    HomeID: `${provider}-h`,
    AwayID: `${provider}-a`,
    StartTime: Date.now() - 60_000,
    SourceGameID: "8",
    BO: 3,
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

function assertMapBetArbSidesOpposite(mapBet, underdogThreshold = 1.95) {
  const { homeOdds, awayOdds, implied } = pickArbOddsLikeA8(mapBet.Sources);
  const bothUnderdog
    = homeOdds >= underdogThreshold && awayOdds >= underdogThreshold;
  assert.ok(
    !bothUnderdog,
    `Map${mapBet.Map} 两侧最高赔都像 underdog（H=${homeOdds} A=${awayOdds} implied=${implied.toFixed(4)}）`,
  );
}

const SUBTOP = "Subtop De France";
const JULIE = "Julie&Cie";
const GB_JULIE = "C-julie";
const GB_SUBTOP = "C-subtop";

const subtopMatches = {
  IA: { "375096": baseMatch("IA", "375096", SUBTOP, JULIE) },
  RAY: { "38403021": baseMatch("RAY", "38403021", SUBTOP, JULIE) },
  OB: { "5717530547693393": baseMatch("OB", "5717530547693393", JULIE, SUBTOP) },
};

const subtopBets = {
  "OB:5717530547693393": {
    provider: "OB",
    matchId: "5717530547693393",
    bets: [
      {
        SourceBetID: "ob-full",
        Map: 0,
        BetName: "[全场]-全局-获胜",
        SourceHomeID: "ob-h",
        HomeOdds: 1.55,
        SourceAwayID: "ob-a",
        AwayOdds: 2.12,
        Status: "Normal",
      },
    ],
  },
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
  "IA:375096": {
    provider: "IA",
    matchId: "375096",
    bets: [
      {
        SourceBetID: "ia-full",
        Map: 0,
        BetName: "[全场]全局获胜",
        SourceHomeID: "ia-h",
        HomeOdds: 1.9,
        SourceAwayID: "ia-a",
        AwayOdds: 1.9,
        Status: "Normal",
      },
    ],
  },
};

const existingClientRows720 = [
  {
    id: 720,
    title: `${SUBTOP} vs ${JULIE}`,
    home_gb_team_id: GB_SUBTOP,
    away_gb_team_id: GB_JULIE,
    reverse: [],
    matchs: { IA: "375096", RAY: "38403021" },
    game: "CS2",
    game_id: "8",
    start_time: Date.now() - 60_000,
    bo: 3,
    round: 0,
    round_start: 0,
    bets: [
      {
        Map: 0,
        HomeName: SUBTOP,
        AwayName: JULIE,
        Sources: {
          RAY: {
            Type: "RAY",
            BetID: "ray-final",
            HomeID: "ray-h",
            AwayID: "ray-a",
            HomeOdds: 1.97,
            AwayOdds: 1.85,
          },
        },
      },
    ],
  },
];

function assignClientId720(list) {
  return list.map((row) => {
    const id = 720;
    return {
      ...row,
      ID: id,
      Bets: (row.Bets || []).map(bet => ({
        ...bet,
        MatchID: id,
        ID: bet.ID ?? `${id}:${bet.Map ?? 0}`,
      })),
    };
  });
}

function setSubtopPlugin() {
  const idMap = {
    "OB:ob-h": GB_JULIE,
    "OB:ob-a": GB_SUBTOP,
    "RAY:ray-h": GB_SUBTOP,
    "RAY:ray-a": GB_JULIE,
    "IA:ia-h": GB_SUBTOP,
    "IA:ia-a": GB_JULIE,
  };
  setTeamPlugin({
    lookupById: (platform, pid) => idMap[`${platform}:${pid}`] || null,
    lookupCanonicalName: (gb) => (gb === GB_JULIE ? JULIE : gb === GB_SUBTOP ? SUBTOP : null),
  });
}

it("subtop: locked Subtop-first + OB join → Title 不变，OB Reverse、RAY 正向", () => {
  setSubtopPlugin();

  const rows = [
    {
      ID: 720,
      Title: `${SUBTOP} vs ${JULIE}`,
      HomeGbTeamId: GB_SUBTOP,
      AwayGbTeamId: GB_JULIE,
      Matchs: { IA: "375096", RAY: "38403021", OB: "5717530547693393" },
      Bets: [{ Map: 0, Sources: {} }],
    },
  ];
  reconcileClientMatchReverse(rows, subtopMatches, subtopBets, {}, src);

  assert.equal(rows[0].Title, `${SUBTOP} vs ${JULIE}`);
  assert.ok(!rows[0].Reverse.includes("RAY"), `RAY should stay aligned, got ${JSON.stringify(rows[0].Reverse)}`);
  assert.ok(rows[0].Reverse.includes("OB"), `OB should reverse, got ${JSON.stringify(rows[0].Reverse)}`);
  assert.ok(!rows[0].Reverse.includes("IA"), "IA aligned with locked Subtop-first");

  setTeamPlugin(null);
});

it("subtop: auto-merge OB + locked existing row → Title 保持 Subtop-first", () => {
  setSubtopPlugin();

  let list = buildClientMatchList({
    matches: subtopMatches,
    bets: subtopBets,
    timers: {},
    sourceFromBet: src,
  });
  assert.equal(list.length, 1);

  list = assignClientId720(list);
  list = applyManualMatchLinks(list, subtopMatches, subtopBets, {}, src, existingClientRows720);

  assert.equal(list.length, 1);
  assert.equal(list[0].Title, `${SUBTOP} vs ${JULIE}`);
  assert.equal(list[0].HomeGbTeamId, GB_SUBTOP);
  assert.equal(list[0].AwayGbTeamId, GB_JULIE);
  assert.ok(!list[0].Reverse.includes("RAY"), `Reverse=${JSON.stringify(list[0].Reverse)}`);
  assert.ok(list[0].Reverse.includes("OB"), `Reverse=${JSON.stringify(list[0].Reverse)}`);

  const map0 = list[0].Bets.find(b => b.Map === 0);
  assert.ok(map0?.Sources?.OB && map0?.Sources?.RAY);
  assertMapBetArbSidesOpposite(map0);

  setTeamPlugin(null);
});
