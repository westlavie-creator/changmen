import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildPolymarketMappedMarket,
  decimalOddsFromProbability,
  mapPolymarketGameId,
  parseJsonArray,
} from "./parse.js";

describe("polymarket-esports parse", () => {
  it("parseJsonArray accepts stringified arrays", () => {
    assert.deepEqual(parseJsonArray('["a","b"]'), ["a", "b"]);
  });

  it("decimalOddsFromProbability truncates to 3 decimals", () => {
    assert.equal(decimalOddsFromProbability(0.5), 2);
    assert.equal(decimalOddsFromProbability(0.51), 1.96);
  });

  it("maps lol moneyline market", () => {
    const market = {
      condition_id: "0xcond",
      sportsMarketType: "moneyline",
      groupItemTitle: "Match Winner",
      active: true,
      closed: false,
      clob_token_ids: '["tok-h","tok-a"]',
      outcomes: '["T1","GEN"]',
      gameStartTime: Date.now() + 600_000,
      events: [{ id: "evt-1", title: "T1 vs GEN", slug: "lol-t1-gen" }],
      tags: [{ slug: "lol", label: "LoL" }],
    };
    assert.equal(mapPolymarketGameId(market), "lol");
    const mapped = buildPolymarketMappedMarket(market, {
      "tok-h": 0.55,
      "tok-a": 0.48,
    });
    assert.ok(mapped);
    assert.equal(mapped.match.SourceMatchID, "evt-1");
    assert.equal(mapped.bet.SourceBetID, "0xcond");
    assert.equal(mapped.bet.SourceHomeID, "tok-h");
    assert.equal(mapped.bet.Map, 0);
    assert.ok(mapped.bet.HomeOdds > 0);
    assert.equal(mapped.bet.Status, "Normal");
  });

  it("rejects yes/no outcomes", () => {
    const market = {
      condition_id: "0xcond",
      sportsMarketType: "moneyline",
      groupItemTitle: "Match Winner",
      active: true,
      clob_token_ids: '["a","b"]',
      outcomes: '["Yes","No"]',
      events: [{ id: "e1" }],
      tags: [{ slug: "cs2" }],
    };
    assert.equal(buildPolymarketMappedMarket(market), null);
  });
});
