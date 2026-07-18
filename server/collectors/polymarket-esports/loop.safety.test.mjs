import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { runPolymarketEsportsDiscoveryCycle } from "./loop.js";

const MONEYLINE_TYPES = new Set(["moneyline", "child_moneyline"]);

describe("polymarket-esports write safety", () => {
  it("shadow mode never writes platform_* even when clearing", async () => {
    const writes = [];
    const stats = await runPolymarketEsportsDiscoveryCycle({
      writePlatform: false,
      resolveTypes: async () => MONEYLINE_TYPES,
      fetchMarkets: async () => ({
        markets: [],
        rawEventCount: 0,
        rawMarketCount: 0,
      }),
      fetchPrices: async () => ({}),
      writeMatches: () => writes.push("matches"),
      replaceBets: () => writes.push("bets"),
      persistIndex: (c) => writes.push(["index", c.length]),
    });
    assert.equal(stats.shadow, true);
    assert.equal(stats.cleared, false);
    assert.deepEqual(writes, [["index", 0]]);
  });

  it("clears when only non-moneyline raw markets exist (live)", async () => {
    const writes = [];
    const stats = await runPolymarketEsportsDiscoveryCycle({
      writePlatform: true,
      resolveTypes: async () => MONEYLINE_TYPES,
      fetchMarkets: async () => ({
        markets: [{
          condition_id: "x",
          sportsMarketType: "spread",
          clob_token_ids: '["a","b"]',
          outcomes: '["A","B"]',
          active: true,
          events: [{ id: "e1" }],
          tags: [{ slug: "lol" }],
        }],
        rawEventCount: 1,
        rawMarketCount: 1,
      }),
      fetchPrices: async () => ({}),
      writeMatches: (p, rows) => writes.push(["matches", p, rows.length]),
      replaceBets: () => writes.push(["bets"]),
      persistIndex: (c) => writes.push(["index", c.length]),
    });
    assert.equal(stats.cleared, true);
    assert.equal(stats.skipped, false);
    assert.deepEqual(writes, [
      ["index", 0],
      ["matches", "Polymarket", 0],
    ]);
  });

  it("skips clear when typed moneyline exists but parse yields zero", async () => {
    const writes = [];
    const stats = await runPolymarketEsportsDiscoveryCycle({
      writePlatform: true,
      resolveTypes: async () => MONEYLINE_TYPES,
      fetchMarkets: async () => ({
        markets: [{
          condition_id: "x",
          sportsMarketType: "moneyline",
          groupItemTitle: "Match Winner",
          clob_token_ids: '["a","b"]',
          outcomes: '["Yes","No"]',
          active: true,
          events: [{ id: "e1" }],
          tags: [{ slug: "lol" }],
        }],
        rawEventCount: 1,
        rawMarketCount: 1,
      }),
      fetchPrices: async () => ({}),
      writeMatches: (p, rows) => writes.push(["matches", p, rows.length]),
      replaceBets: () => writes.push(["bets"]),
      persistIndex: () => writes.push(["index"]),
    });
    assert.equal(stats.skipped, true);
    assert.equal(stats.reason, "filter_empty_with_typed_ml");
    assert.deepEqual(writes, []);
  });

  it("groups multiple bets per SourceMatchID into one replace (live)", async () => {
    const replaces = [];
    const now = Date.now() + 600_000;
    const base = {
      sportsMarketType: "moneyline",
      groupItemTitle: "Match Winner",
      active: true,
      closed: false,
      gameStartTime: now,
      events: [{ id: "evt-shared", title: "A vs B" }],
      tags: [{ slug: "lol", label: "LoL" }],
    };
    const stats = await runPolymarketEsportsDiscoveryCycle({
      writePlatform: true,
      resolveTypes: async () => MONEYLINE_TYPES,
      fetchMarkets: async () => ({
        markets: [
          {
            ...base,
            condition_id: "cond-ml",
            clob_token_ids: '["h1","a1"]',
            outcomes: '["Alpha","Beta"]',
          },
          {
            ...base,
            condition_id: "cond-m1",
            sportsMarketType: "child_moneyline",
            groupItemTitle: "Map 1 Winner",
            clob_token_ids: '["h2","a2"]',
            outcomes: '["Alpha","Beta"]',
          },
        ],
        rawEventCount: 1,
        rawMarketCount: 2,
      }),
      fetchPrices: async () => ({
        h1: 0.55,
        a1: 0.48,
        h2: 0.52,
        a2: 0.5,
      }),
      writeMatches: () => {},
      replaceBets: (p, sid, bets) => replaces.push({ p, sid, n: bets.length }),
      persistIndex: () => {},
    });
    assert.equal(stats.matches, 1);
    assert.equal(stats.bets, 2);
    assert.deepEqual(replaces, [
      { p: "Polymarket", sid: "evt-shared", n: 2 },
    ]);
  });

  it("whole-match truncate does not split a SourceMatchID", async () => {
    const now = Date.now() + 600_000;
    const mk = (cond, evt, type, groupTitle, tokens) => ({
      condition_id: cond,
      sportsMarketType: type,
      groupItemTitle: groupTitle,
      active: true,
      closed: false,
      gameStartTime: now,
      clob_token_ids: JSON.stringify(tokens),
      outcomes: '["Alpha","Beta"]',
      events: [{ id: evt }],
      tags: [{ slug: "lol" }],
    });
    const prices = {
      h1: 0.5, a1: 0.5, h2: 0.5, a2: 0.5, h3: 0.5, a3: 0.5,
    };
    const stats = await runPolymarketEsportsDiscoveryCycle({
      writePlatform: false,
      maxTracked: 2,
      resolveTypes: async () => MONEYLINE_TYPES,
      fetchMarkets: async () => ({
        markets: [
          mk("c1", "e1", "moneyline", "Match Winner", ["h1", "a1"]),
          mk("c2", "e1", "child_moneyline", "Map 1 Winner", ["h2", "a2"]),
          mk("c3", "e2", "moneyline", "Match Winner", ["h3", "a3"]),
        ],
        rawEventCount: 2,
        rawMarketCount: 3,
      }),
      fetchPrices: async () => prices,
      writeMatches: () => {},
      replaceBets: () => {},
      persistIndex: () => {},
    });
    // e1 has 2 markets → fills cap; e2 dropped whole
    assert.equal(stats.bets, 2);
    assert.equal(stats.matches, 1);
    assert.equal(stats.truncated, true);
  });

  it("shadow mode still builds index but skips replaceBets", async () => {
    const writes = [];
    const now = Date.now() + 600_000;
    const stats = await runPolymarketEsportsDiscoveryCycle({
      writePlatform: false,
      resolveTypes: async () => MONEYLINE_TYPES,
      fetchMarkets: async () => ({
        markets: [{
          condition_id: "cond-1",
          sportsMarketType: "moneyline",
          groupItemTitle: "Match Winner",
          active: true,
          closed: false,
          gameStartTime: now,
          clob_token_ids: '["h","a"]',
          outcomes: '["Alpha","Beta"]',
          events: [{ id: "evt-1" }],
          tags: [{ slug: "lol" }],
        }],
        rawEventCount: 1,
        rawMarketCount: 1,
      }),
      fetchPrices: async () => ({ h: 0.5, a: 0.5 }),
      writeMatches: () => writes.push("matches"),
      replaceBets: () => writes.push("bets"),
      persistIndex: (c) => writes.push(["index", c.length]),
    });
    assert.equal(stats.shadow, true);
    assert.equal(stats.matches, 1);
    assert.deepEqual(writes, [["index", 1]]);
  });
});
