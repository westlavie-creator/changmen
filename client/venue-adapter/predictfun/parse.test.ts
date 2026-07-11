import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  bestAskFromPredictBook,
  buildPredictMappedMarket,
  decimalOddsFromProbability,
  isPredictEsportsMoneylineCategory,
  mapPredictEsportTag,
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

  it("reads best ask from tuple orderbook", () => {
    assert.equal(bestAskFromPredictBook({ asks: [[0.55, 100], [0.56, 50]] }), 0.55);
    assert.equal(bestAskFromPredictBook({ asks: [] }), 0);
  });
});
