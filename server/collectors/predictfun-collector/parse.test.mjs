import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bestAskFromPredictBook,
  buildPredictMappedMarket,
  decimalOddsFromProbability,
  isPredictEsportsMoneylineCategory,
  mapPredictEsportTag,
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

  it("reads best ask from tuple orderbook", () => {
    assert.equal(bestAskFromPredictBook({ asks: [[0.55, 100], [0.56, 50]] }), 0.55);
    assert.equal(bestAskFromPredictBook({ asks: [] }), 0);
  });
});
