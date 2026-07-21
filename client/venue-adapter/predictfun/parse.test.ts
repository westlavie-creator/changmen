import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  bestAskFromPredictBook,
  buildPredictFunBookMeta,
  buildPredictMappedMarket,
  decimalOddsFromProbability,
  getPredictComplement,
  isPredictEsportsMoneylineCategory,
  isPredictYesOutcomeToken,
  mapPredictEsportTag,
  orderbookForOutcomeBuy,
  predictBuyAskFromYesBook,
} from "./parse";

const SAMPLE_CATEGORY = {
  id: 9001,
  slug: "team-alpha-vs-team-beta-cs2",
  title: "Team Alpha vs Team Beta",
  status: "OPEN",
  marketVariant: "SPORTS_TEAM_MATCH",
  startsAt: "2026-07-11T12:00:00.000Z",
  tags: [{ id: "11", name: "CS2" }],
  markets: [
    {
      id: 472,
      title: "Team Alpha",
      status: "OPEN",
      tradingStatus: "OPEN",
      marketType: "SPORTS_MONEYLINE",
      team: { id: 1, name: "Team Alpha", abbreviation: "TA", league: "CS2" },
      outcomes: [
        { name: "Yes", onChainId: "1111111111111111111111111111111111111111111111111111111111111111", indexSet: 1 },
        { name: "No", onChainId: "2222222222222222222222222222222222222222222222222222222222222222", indexSet: 2 },
      ],
    },
    {
      id: 473,
      title: "Team Beta",
      status: "OPEN",
      tradingStatus: "OPEN",
      marketType: "SPORTS_MONEYLINE",
      team: { id: 2, name: "Team Beta", abbreviation: "TB", league: "CS2" },
      outcomes: [
        { name: "Yes", onChainId: "3333333333333333333333333333333333333333333333333333333333333333", indexSet: 1 },
        { name: "No", onChainId: "4444444444444444444444444444444444444444444444444444444444444444", indexSet: 2 },
      ],
    },
  ],
};

const SAMPLE_ESPORTS_LOL = {
  id: 220811,
  slug: "lol-fluxo-vs-leviatan",
  title: "LoL: Fluxo W7M vs Leviatan Esports (BO3)",
  status: "OPEN",
  marketVariant: "ESPORTS_LOL",
  startsAt: "2026-07-26T16:00:00.000Z",
  tags: [{ id: "83", name: "Esports" }, { id: "84", name: "LoL" }],
  markets: [
    {
      id: 841133,
      title: "Match Winner",
      status: "REGISTERED",
      tradingStatus: "OPEN",
      marketType: "SPORTS_MONEYLINE",
      outcomes: [
        {
          name: "FXW7",
          onChainId: "1111111111111111111111111111111111111111111111111111111111111111",
          bestAsk: { price: 0.55, size: 10 },
          variantData: { type: "ESPORTS_LOL", team: { id: 1, name: "Fluxo W7M", abbreviation: "FX" } },
        },
        {
          name: "LEV",
          onChainId: "2222222222222222222222222222222222222222222222222222222222222222",
          bestAsk: { price: 0.48, size: 10 },
          variantData: { type: "ESPORTS_LOL", team: { id: 2, name: "LEVIATÁN", abbreviation: "LEV" } },
        },
      ],
    },
  ],
};

describe("predictfun parse", () => {
  it("maps esport tags to catalog codes", () => {
    assert.equal(mapPredictEsportTag("CS2"), "cs2");
    assert.equal(mapPredictEsportTag("League of Legends"), "lol");
    assert.equal(mapPredictEsportTag("dota-2"), "dota2");
    assert.equal(mapPredictEsportTag("Football"), null);
  });

  it("detects esports SPORTS_TEAM_MATCH categories", () => {
    assert.equal(isPredictEsportsMoneylineCategory(SAMPLE_CATEGORY), true);
    assert.equal(isPredictEsportsMoneylineCategory({ ...SAMPLE_CATEGORY, tags: [{ name: "Politics" }] }), false);
  });

  it("detects ESPORTS_LOL single-market dual-outcome categories", () => {
    assert.equal(isPredictEsportsMoneylineCategory(SAMPLE_ESPORTS_LOL), true);
  });

  it("builds mapped market with orderbook buy prices", () => {
    const mapped = buildPredictMappedMarket(SAMPLE_CATEGORY, {
      "472": 0.62,
      "473": 0.41,
    });
    assert.ok(mapped);
    assert.equal(mapped!.match.SourceGameID, "cs2");
    assert.equal(mapped!.bet.SourceHomeID, "1111111111111111111111111111111111111111111111111111111111111111");
    assert.equal(mapped!.bet.SourceAwayID, "3333333333333333333333333333333333333333333333333333333333333333");
    assert.equal(mapped!.bet.HomeOdds, decimalOddsFromProbability(0.62));
    assert.equal(mapped!.bet.AwayOdds, decimalOddsFromProbability(0.41));
    assert.equal(mapped!.bet.Status, "Normal");
  });

  it("builds ESPORTS_LOL mapped market from outcome variantData", () => {
    const mapped = buildPredictMappedMarket(SAMPLE_ESPORTS_LOL);
    assert.ok(mapped);
    assert.equal(mapped!.match.SourceGameID, "lol");
    assert.equal(mapped!.homeMarketId, mapped!.awayMarketId);
    assert.equal(mapped!.bet.HomeName, "Fluxo W7M");
    assert.equal(mapped!.bet.AwayName, "LEVIATÁN");
    assert.equal(mapped!.bet.HomeOdds, decimalOddsFromProbability(0.55));
    assert.equal(mapped!.bet.AwayOdds, decimalOddsFromProbability(0.48));
    assert.equal(mapped!.bet.Status, "Normal");
    assert.equal(mapped!.bets.length, 1);
    assert.equal(mapped!.bets[0].Map, 0);
  });

  it("maps Game N Winner child moneylines to Map N", () => {
    const cat = {
      ...SAMPLE_ESPORTS_LOL,
      marketVariant: "ESPORTS_DOTA2",
      tags: [{ id: "83", name: "Esports" }, { id: "85", name: "Dota 2" }],
      markets: [
        {
          id: 1,
          title: "Game 1 Winner",
          status: "RESOLVED",
          tradingStatus: "CLOSED",
          marketType: "SPORTS_CHILD_MONEYLINE",
          outcomes: [
            { name: "A", onChainId: "a1", variantData: { team: { name: "BetBoom Team" } } },
            { name: "B", onChainId: "a2", variantData: { team: { name: "Parivision" } } },
          ],
        },
        {
          id: 2,
          title: "Game 2 Winner",
          status: "REGISTERED",
          tradingStatus: "OPEN",
          marketType: "SPORTS_CHILD_MONEYLINE",
          outcomes: [
            { name: "A", onChainId: "b1", bestAsk: { price: 0.4 }, variantData: { team: { name: "BetBoom Team" } } },
            { name: "B", onChainId: "b2", bestAsk: { price: 0.6 }, variantData: { team: { name: "Parivision" } } },
          ],
        },
        SAMPLE_ESPORTS_LOL.markets[0],
      ],
    };
    const mapped = buildPredictMappedMarket(cat);
    assert.ok(mapped);
    const maps = mapped!.bets.map(b => b.Map).sort((a, b) => Number(a) - Number(b));
    assert.deepEqual(maps, [0, 1, 2]);
    assert.equal(mapped!.bets.find(b => b.Map === 1)?.Status, "Locked");
    assert.equal(mapped!.bets.find(b => b.Map === 2)?.Status, "Normal");
  });

  it("maps Map N Winner child markets without outcome.team via Match Winner abbr", () => {
    const cat = {
      id: 222661,
      slug: "cs2-inf6-nem-2026-07-22",
      title: "Counter-Strike: Infinite vs Team Nemesis (BO3)",
      status: "OPEN",
      marketVariant: "ESPORTS_CS2",
      startsAt: "2026-07-22T12:00:00.000Z",
      tags: [{ id: "83", name: "Esports" }, { id: "86", name: "CS2" }],
      markets: [
        {
          id: 847769,
          title: "Match Winner",
          status: "REGISTERED",
          tradingStatus: "OPEN",
          marketType: "SPORTS_MONEYLINE",
          outcomes: [
            {
              name: "INF6",
              onChainId: "1111111111111111111111111111111111111111111111111111111111111111",
              bestAsk: { price: 0.55 },
              variantData: { team: { name: "Infinite", abbreviation: "INF6" } },
            },
            {
              name: "NEM",
              onChainId: "2222222222222222222222222222222222222222222222222222222222222222",
              bestAsk: { price: 0.48 },
              variantData: { team: { name: "Team Nemesis", abbreviation: "NEM" } },
            },
          ],
        },
        {
          id: 847767,
          title: "Map 1 Winner",
          status: "REGISTERED",
          tradingStatus: "OPEN",
          marketType: "SPORTS_CHILD_MONEYLINE",
          outcomes: [
            { name: "INF6", onChainId: "m1h", bestAsk: { price: 0.52 } },
            { name: "NEM", onChainId: "m1a", bestAsk: { price: 0.5 } },
          ],
        },
        {
          id: 847768,
          title: "Map 2 Winner",
          status: "REGISTERED",
          tradingStatus: "OPEN",
          marketType: "SPORTS_CHILD_MONEYLINE",
          outcomes: [
            { name: "INF6", onChainId: "m2h", bestAsk: { price: 0.4 } },
            { name: "NEM", onChainId: "m2a", bestAsk: { price: 0.62 } },
          ],
        },
      ],
    };
    const mapped = buildPredictMappedMarket(cat);
    assert.ok(mapped);
    const maps = mapped!.bets.map(b => b.Map).sort((a, b) => Number(a) - Number(b));
    assert.deepEqual(maps, [0, 1, 2]);
    assert.equal(mapped!.bets.find(b => b.Map === 1)?.HomeName, "Infinite");
    assert.equal(mapped!.bets.find(b => b.Map === 1)?.AwayName, "Team Nemesis");
    assert.equal(mapped!.bets.find(b => b.Map === 1)?.BetName, "Map 1 Winner");
    assert.equal(mapped!.bets.find(b => b.Map === 2)?.SourceBetID, "cs2-inf6-nem-2026-07-22#m2");
  });

  it("reads best ask from tuple orderbook", () => {
    assert.equal(bestAskFromPredictBook({ asks: [[0.55, 100], [0.56, 50]] }), 0.55);
    assert.equal(bestAskFromPredictBook({ asks: [] }), 0);
  });

  it("getPredictComplement matches official decimalPrecision rounding", () => {
    assert.equal(getPredictComplement(0.18, 2), 0.82);
    assert.equal(getPredictComplement(0.16, 2), 0.84);
    assert.equal(getPredictComplement(0.33, 2), 0.67);
  });

  it("transforms Yes book to No asks via bids complement", () => {
    const yes = {
      marketId: 1,
      asks: [[0.18, 200], [0.19, 100]] as [number, number][],
      bids: [[0.16, 200], [0.15, 50]] as [number, number][],
    };
    const no = orderbookForOutcomeBuy(yes, { isYesOutcome: false, decimalPrecision: 2 });
    assert.deepEqual(no.asks, [[0.84, 200], [0.85, 50]]);
    assert.deepEqual(no.bids, [[0.82, 200], [0.81, 100]]);
    assert.equal(bestAskFromPredictBook(no), 0.84);
  });

  it("predictBuyAskFromYesBook matches executable buy asks", () => {
    const yes = {
      asks: [[0.18, 200]] as [number, number][],
      bids: [[0.16, 200]] as [number, number][],
    };
    assert.equal(predictBuyAskFromYesBook(yes, true, 2), 0.18);
    assert.equal(predictBuyAskFromYesBook(yes, false, 2), 0.84);
  });

  it("buildPredictFunBookMeta dual-outcome vs dual-market", () => {
    const dual = buildPredictFunBookMeta({
      homeTokenId: "h",
      awayTokenId: "a",
      yesTokenId: "h",
      dualOutcomeSameMarket: true,
    });
    assert.deepEqual(dual.tokens, [
      { tokenId: "h", isYes: true },
      { tokenId: "a", isYes: false },
    ]);
    const missingYes = buildPredictFunBookMeta({
      homeTokenId: "h",
      awayTokenId: "a",
      dualOutcomeSameMarket: true,
    });
    assert.deepEqual(missingYes.tokens, []);
    const oneSide = buildPredictFunBookMeta({
      homeTokenId: "h",
      awayTokenId: "a",
      dualOutcomeSameMarket: false,
      sideTokenId: "a",
    });
    assert.deepEqual(oneSide.tokens, [{ tokenId: "a", isYes: true }]);
  });

  it("detects Yes vs No token by indexSet / onChainId", () => {
    const outcomes = [
      { name: "BB4", indexSet: 1, onChainId: "tok-yes" },
      { name: "PARI", indexSet: 2, onChainId: "tok-no" },
    ];
    assert.equal(isPredictYesOutcomeToken("tok-yes", outcomes), true);
    assert.equal(isPredictYesOutcomeToken("tok-no", outcomes), false);
  });
});
