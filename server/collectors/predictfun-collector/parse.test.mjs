import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bestAskFromPredictBook,
  buildPredictMappedMarket,
  decimalOddsFromProbability,
  findPredictMatchWinnerMarket,
  isPredictCategoryOpenForCollect,
  isPredictEsportsMoneylineCategory,
  isPredictMarketResolvingOrSettled,
  mapPredictEsportTag,
  resolvePredictOutcomeBuyProb,
} from "./parse.js";

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

describe("predictfun-collector parse", () => {
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

  it("stops collect when Match Winner is PRICE_PROPOSED / RESOLVED (category still OPEN)", () => {
    assert.equal(isPredictCategoryOpenForCollect(SAMPLE_ESPORTS_LOL), true);
    assert.equal(
      isPredictCategoryOpenForCollect({
        ...SAMPLE_ESPORTS_LOL,
        markets: [{
          ...SAMPLE_ESPORTS_LOL.markets[0],
          status: "PRICE_PROPOSED",
          tradingStatus: "OPEN",
        }],
      }),
      false,
    );
    assert.equal(
      isPredictCategoryOpenForCollect({
        ...SAMPLE_ESPORTS_LOL,
        markets: [{
          ...SAMPLE_ESPORTS_LOL.markets[0],
          status: "RESOLVED",
          tradingStatus: "CLOSED",
        }],
      }),
      false,
    );
    assert.equal(isPredictMarketResolvingOrSettled({ status: "REGISTERED", tradingStatus: "OPEN" }), false);
    assert.equal(isPredictMarketResolvingOrSettled({ status: "PRICE_PROPOSED" }), true);
    const ml = findPredictMatchWinnerMarket(SAMPLE_ESPORTS_LOL.markets);
    assert.equal(String(ml?.title), "Match Winner");
  });

  it("does not treat dual team-named moneyline as Match Winner", () => {
    assert.equal(findPredictMatchWinnerMarket(SAMPLE_CATEGORY.markets), null);
    assert.equal(isPredictCategoryOpenForCollect(SAMPLE_CATEGORY), true);
    assert.equal(
      isPredictCategoryOpenForCollect({
        ...SAMPLE_CATEGORY,
        markets: SAMPLE_CATEGORY.markets.map(m => ({
          ...m,
          status: "PRICE_PROPOSED",
        })),
      }),
      false,
    );
  });

  it("builds mapped market with orderbook buy prices", () => {
    const mapped = buildPredictMappedMarket(SAMPLE_CATEGORY, {
      472: 0.62,
      473: 0.41,
    });
    assert.ok(mapped);
    assert.equal(mapped.match.SourceGameID, "cs2");
    assert.equal(mapped.bet.SourceHomeID, "1111111111111111111111111111111111111111111111111111111111111111");
    assert.equal(mapped.bet.SourceAwayID, "3333333333333333333333333333333333333333333333333333333333333333");
    assert.equal(mapped.bet.HomeOdds, decimalOddsFromProbability(0.62));
    assert.equal(mapped.bet.AwayOdds, decimalOddsFromProbability(0.41));
    assert.equal(mapped.bet.Status, "Normal");
  });

  it("builds ESPORTS_LOL mapped market from outcome variantData", () => {
    const mapped = buildPredictMappedMarket(SAMPLE_ESPORTS_LOL);
    assert.ok(mapped);
    assert.equal(mapped.match.SourceGameID, "lol");
    assert.equal(mapped.homeMarketId, mapped.awayMarketId);
    assert.equal(mapped.bet.HomeName, "Fluxo W7M");
    assert.equal(mapped.bet.AwayName, "LEVIATÁN");
    assert.equal(mapped.bet.HomeOdds, decimalOddsFromProbability(0.55));
    assert.equal(mapped.bet.AwayOdds, decimalOddsFromProbability(0.48));
    assert.equal(mapped.bet.Status, "Normal");
  });

  it("maps Map N Winner without outcome.team via Match Winner abbr", () => {
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
    assert.equal(mapped.bets.length, 3);
    assert.deepEqual(mapped.bets.map(b => b.Map).sort((a, b) => a - b), [0, 1, 2]);
    assert.equal(mapped.bets.find(b => b.Map === 1)?.HomeName, "Infinite");
    assert.equal(mapped.bets.find(b => b.Map === 1)?.AwayName, "Team Nemesis");
    assert.equal(mapped.bets.find(b => b.Map === 2)?.BetName, "Map 2 Winner");
  });

  it("reads best ask from tuple orderbook", () => {
    assert.equal(bestAskFromPredictBook({ asks: [[0.55, 100], [0.56, 50]] }), 0.55);
    assert.equal(bestAskFromPredictBook({ asks: [] }), 0);
  });

  it("resolvePredictOutcomeBuyProb uses Yes book + No complement", () => {
    const market = {
      id: 100,
      decimalPrecision: 2,
      outcomes: [
        { name: "HOME", onChainId: "h", indexSet: 1 },
        { name: "AWAY", onChainId: "a", indexSet: 2 },
      ],
    };
    const book = {
      asks: [[0.18, 200], [0.19, 100]],
      bids: [[0.16, 200], [0.15, 50]],
    };
    assert.equal(resolvePredictOutcomeBuyProb({
      market,
      outcome: market.outcomes[0],
      orderbooks: { "100": book },
    }), 0.18);
    assert.equal(resolvePredictOutcomeBuyProb({
      market,
      outcome: market.outcomes[1],
      orderbooks: { "100": book },
    }), 0.84);
    assert.equal(resolvePredictOutcomeBuyProb({
      market,
      outcome: market.outcomes[1],
      marketYesAsk: { "100": 0.33 },
    }), 0);
  });

  it("map child odds prefer orderbook over missing outcome.bestAsk", () => {
    const cat = {
      id: 222661,
      slug: "cs2-book-map",
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
          decimalPrecision: 2,
          outcomes: [
            {
              name: "INF6",
              onChainId: "mw-h",
              bestAsk: { price: 0.99 },
              variantData: { team: { name: "Infinite", abbreviation: "INF6" } },
            },
            {
              name: "NEM",
              onChainId: "mw-a",
              bestAsk: { price: 0.01 },
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
          decimalPrecision: 2,
          outcomes: [
            { name: "INF6", onChainId: "m1h" },
            { name: "NEM", onChainId: "m1a" },
          ],
        },
      ],
    };
    const orderbooks = {
      "847769": { asks: [[0.55, 100]], bids: [[0.48, 80]] },
      "847767": { asks: [[0.40, 50]], bids: [[0.35, 40]] },
    };
    const mapped = buildPredictMappedMarket(cat, {}, orderbooks);
    assert.ok(mapped);
    const m0 = mapped.bets.find(b => b.Map === 0);
    const m1 = mapped.bets.find(b => b.Map === 1);
    assert.equal(m0.HomeOdds, decimalOddsFromProbability(0.55));
    assert.equal(m0.AwayOdds, decimalOddsFromProbability(0.52));
    assert.equal(m1.HomeOdds, decimalOddsFromProbability(0.40));
    assert.equal(m1.AwayOdds, decimalOddsFromProbability(0.65));
  });

  it("ignores First Blood props and maps Match Winner teams (live ESPORTS_DOTA2 shape)", () => {
    const cat = {
      id: 297627,
      slug: "dota2-liquid-vg-2026-08-13",
      title: "Dota 2: Team Liquid vs Vici Gaming (BO3) - The International Group Stage",
      status: "OPEN",
      marketVariant: "ESPORTS_DOTA2",
      startsAt: "2026-08-13T06:00:00.000Z",
      tags: [{ id: "83", name: "Esports" }, { id: "87", name: "Dota 2" }],
      variantDetails: {
        sports: {
          provider: "POLYMARKET",
          teams: [
            { id: 61, name: "Team Liquid", abbreviation: "liquid" },
            { id: 77198, name: "Vici Gaming", abbreviation: "vg" },
          ],
        },
      },
      markets: [
        {
          id: 1293772,
          title: "Match Winner",
          status: "REGISTERED",
          tradingStatus: "OPEN",
          marketType: "SPORTS_MONEYLINE",
          outcomes: [
            {
              name: "TL",
              onChainId: "mw-home-token",
              bestAsk: { price: 0.75 },
              team: { id: 61, name: "Team Liquid", abbreviation: "liquid", league: "dota2" },
              variantDetails: { sports: { team: { id: 61, name: "Team Liquid", abbreviation: "liquid" } } },
            },
            {
              name: "VG",
              onChainId: "mw-away-token",
              bestAsk: { price: 0.26 },
              team: { id: 77198, name: "Vici Gaming", abbreviation: "vg", league: "dota2" },
              variantDetails: { sports: { team: { id: 77198, name: "Vici Gaming", abbreviation: "vg" } } },
            },
          ],
        },
        {
          id: 1293774,
          title: "Game 1 Winner",
          status: "REGISTERED",
          tradingStatus: "OPEN",
          marketType: "SPORTS_CHILD_MONEYLINE",
          outcomes: [
            { name: "TL", onChainId: "g1-h", bestAsk: { price: 0.6 } },
            { name: "VG", onChainId: "g1-a", bestAsk: { price: 0.42 } },
          ],
        },
        {
          id: 1345026,
          title: "First Blood in Game 1?",
          status: "REGISTERED",
          tradingStatus: "OPEN",
          marketType: null,
          outcomes: [
            {
              name: "TL",
              onChainId: "fb1-h",
              bestAsk: { price: 0.5 },
              team: { id: 61, name: "Team Liquid", abbreviation: "liquid" },
            },
            {
              name: "VG",
              onChainId: "fb1-a",
              bestAsk: { price: 0.5 },
              team: { id: 77198, name: "Vici Gaming", abbreviation: "vg" },
            },
          ],
        },
        {
          id: 1345025,
          title: "First Blood in Game 2?",
          status: "REGISTERED",
          tradingStatus: "OPEN",
          marketType: null,
          outcomes: [
            {
              name: "TL",
              onChainId: "fb2-h",
              bestAsk: { price: 0.5 },
              team: { id: 61, name: "Team Liquid", abbreviation: "liquid" },
            },
            {
              name: "VG",
              onChainId: "fb2-a",
              bestAsk: { price: 0.5 },
              team: { id: 77198, name: "Vici Gaming", abbreviation: "vg" },
            },
          ],
        },
        {
          id: 1345028,
          title: "Total Kills Over/Under 50.5 in Game 1?",
          status: "REGISTERED",
          tradingStatus: "OPEN",
          marketType: null,
          outcomes: [
            { name: "Over", onChainId: "ou-o", bestAsk: { price: 0.5 } },
            { name: "Under", onChainId: "ou-u", bestAsk: { price: 0.5 } },
          ],
        },
      ],
    };

    assert.equal(isPredictEsportsMoneylineCategory(cat), true);
    const mapped = buildPredictMappedMarket(cat);
    assert.ok(mapped);
    assert.equal(mapped.match.Home, "Team Liquid");
    assert.equal(mapped.match.Away, "Vici Gaming");
    assert.equal(mapped.match.HomeID, "dota2:team-liquid");
    assert.equal(mapped.match.AwayID, "dota2:vici-gaming");
    assert.equal(mapped.homeTokenId, "mw-home-token");
    assert.equal(mapped.awayTokenId, "mw-away-token");
    assert.ok(!String(mapped.match.Home).toLowerCase().includes("first blood"));
    assert.ok(!mapped.bets.some(b => /first blood/i.test(b.HomeName) || /first blood/i.test(b.AwayName)));
    assert.equal(mapped.bets.find(b => b.Map === 0)?.BetName, "Match Winner");
    assert.equal(mapped.bets.find(b => b.Map === 1)?.HomeName, "Team Liquid");
    assert.equal(mapped.bets.find(b => b.Map === 1)?.SourceHomeID, "g1-h");
  });

  it("resolves Match Winner teams from category.variantDetails when outcome.team missing", () => {
    const cat = {
      id: 297618,
      slug: "dota2-falcons-lgd",
      title: "Dota 2: Team Falcons vs LGD Gaming (BO3)",
      status: "OPEN",
      marketVariant: "ESPORTS_DOTA2",
      startsAt: "2026-08-13T02:00:00.000Z",
      tags: [{ name: "Dota 2" }],
      variantDetails: {
        sports: {
          teams: [
            { name: "Team Falcons", abbreviation: "flc" },
            { name: "LGD Gaming", abbreviation: "lgd" },
          ],
        },
      },
      markets: [
        {
          id: 1,
          title: "Match Winner",
          status: "REGISTERED",
          tradingStatus: "OPEN",
          marketType: "SPORTS_MONEYLINE",
          outcomes: [
            // abbr 与 category.abbreviation 不一致时走 teams 顺序兜底
            { name: "T1", onChainId: "h", bestAsk: { price: 0.55 } },
            { name: "T2", onChainId: "a", bestAsk: { price: 0.48 } },
          ],
        },
      ],
    };
    const mapped = buildPredictMappedMarket(cat);
    assert.ok(mapped);
    assert.equal(mapped.match.Home, "Team Falcons");
    assert.equal(mapped.match.Away, "LGD Gaming");
  });
});
