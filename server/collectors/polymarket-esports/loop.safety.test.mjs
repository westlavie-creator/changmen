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
      fetchExistingMatches: async () => ({ Polymarket: [] }),
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
      fetchExistingMatches: async () => ({ Polymarket: [] }),
      readPrevIndex: () => ({ entries: [] }),
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

  it("does not clear when soft-retain ids exist but index cannot rebuild", async () => {
    const writes = [];
    const now = Date.now();
    const stats = await runPolymarketEsportsDiscoveryCycle({
      writePlatform: true,
      nowMs: now,
      resolveTypes: async () => MONEYLINE_TYPES,
      fetchMarkets: async () => ({
        markets: [],
        rawEventCount: 0,
        rawMarketCount: 0,
      }),
      fetchPrices: async () => ({}),
      fetchExistingMatches: async () => ({
        Polymarket: [{
          SourceMatchID: "752423",
          StartTime: now - 30 * 60_000,
          Home: "EDG",
          Away: "RNG",
        }],
      }),
      readPrevIndex: () => ({ entries: [] }),
      writeMatches: (...args) => writes.push(args),
      replaceBets: (...args) => writes.push(["bets", ...args]),
      persistIndex: (...args) => writes.push(["index", args[0]?.length ?? args[0]]),
    });
    assert.equal(stats.skipped, true);
    assert.equal(stats.reason, "soft_retain_without_index");
    assert.equal(writes.length, 0);
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
      fetchExistingMatches: async () => ({ Polymarket: [] }),
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
      fetchExistingMatches: async () => ({ Polymarket: [] }),
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
      fetchExistingMatches: async () => ({ Polymarket: [] }),
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
      fetchExistingMatches: async () => ({ Polymarket: [] }),
      writeMatches: () => writes.push("matches"),
      replaceBets: () => writes.push("bets"),
      persistIndex: (c) => writes.push(["index", c.length]),
    });
    assert.equal(stats.shadow, true);
    assert.equal(stats.matches, 1);
    assert.deepEqual(writes, [["index", 1]]);
  });

  it("soft-retains in-window match missing from this Gamma pass", async () => {
    const now = Date.now();
    const writes = [];
    const indexCalls = [];
    const betWrites = [];
    const stats = await runPolymarketEsportsDiscoveryCycle({
      writePlatform: true,
      nowMs: now,
      resolveTypes: async () => MONEYLINE_TYPES,
      fetchMarkets: async () => ({
        markets: [{
          condition_id: "cond-keep",
          sportsMarketType: "moneyline",
          groupItemTitle: "Match Winner",
          active: true,
          closed: false,
          gameStartTime: now + 600_000,
          clob_token_ids: '["h","a"]',
          outcomes: '["Alpha","Beta"]',
          events: [{ id: "evt-keep" }],
          tags: [{ slug: "lol" }],
        }],
        rawEventCount: 1,
        rawMarketCount: 1,
      }),
      fetchPrices: async () => ({ h: 0.5, a: 0.5 }),
      fetchExistingMatches: async () => ({
        Polymarket: [{
          SourceMatchID: "751074",
          StartTime: now - 45 * 60_000,
          Home: "CYBERSHOKE Esports",
          Away: "Team Comanche",
        }],
      }),
      readPrevIndex: () => ({
        updatedAt: now - 60_000,
        assetIds: ["ph", "pa"],
        entries: [{
          sourceMatchId: "751074",
          marketId: "cond-old",
          homeTokenId: "ph",
          awayTokenId: "pa",
          sourceBetId: "cond-old",
          map: 0,
          homeName: "CYBERSHOKE Esports",
          awayName: "Team Comanche",
          homeOdds: 1.9,
          awayOdds: 1.9,
          status: "Normal",
          startTime: now - 45 * 60_000,
        }],
      }),
      writeMatches: async (p, rows, opts) => writes.push({
        p,
        n: rows.length,
        sids: rows.map(r => String(r.SourceMatchID)),
        alsoKeep: opts?.alsoKeepSourceMatchIds || [],
      }),
      replaceBets: async (p, sid, bets) => betWrites.push({ sid, n: bets.length }),
      persistIndex: (c, _prices, opts) => indexCalls.push({
        n: c.length,
        retain: opts?.retainSourceMatchIds || [],
        prev: (opts?.previousEntries || []).length,
      }),
    });
    // 本轮 1 场 + Index 回填 751074
    assert.equal(stats.matches, 2);
    assert.equal(stats.softRetained, 1);
    assert.ok(writes[0]?.sids.includes("751074"));
    assert.ok(writes[0]?.sids.includes("evt-keep"));
    assert.deepEqual(writes[0]?.alsoKeep, ["751074"]);
    assert.deepEqual(indexCalls[0]?.retain, ["751074"]);
    assert.equal(indexCalls[0]?.prev, 1);
    assert.ok(betWrites.some(b => b.sid === "751074"));
  });

  it("resurrects from Index when DB already orphan-deleted the row", async () => {
    const now = Date.now();
    const writes = [];
    const stats = await runPolymarketEsportsDiscoveryCycle({
      writePlatform: true,
      nowMs: now,
      resolveTypes: async () => MONEYLINE_TYPES,
      fetchMarkets: async () => ({
        markets: [{
          condition_id: "cond-keep",
          sportsMarketType: "moneyline",
          groupItemTitle: "Match Winner",
          active: true,
          closed: false,
          gameStartTime: now + 600_000,
          clob_token_ids: '["h","a"]',
          outcomes: '["Alpha","Beta"]',
          events: [{ id: "evt-keep" }],
          tags: [{ slug: "lol" }],
        }],
        rawEventCount: 1,
        rawMarketCount: 1,
      }),
      fetchPrices: async () => ({ h: 0.5, a: 0.5 }),
      // DB 已空 —— 纯靠 Index startTime 回填
      fetchExistingMatches: async () => ({ Polymarket: [] }),
      readPrevIndex: () => ({
        updatedAt: now - 60_000,
        assetIds: ["eh", "ea"],
        entries: [{
          sourceMatchId: "752423",
          marketId: "cond-edg",
          homeTokenId: "eh",
          awayTokenId: "ea",
          sourceBetId: "cond-edg",
          map: 0,
          homeName: "EDward Gaming",
          awayName: "RNG M",
          homeOdds: 1.85,
          awayOdds: 2.05,
          status: "Normal",
          startTime: now - 50 * 60_000,
        }],
      }),
      writeMatches: async (_p, rows, opts) => writes.push({
        sids: rows.map(r => String(r.SourceMatchID)),
        alsoKeep: opts?.alsoKeepSourceMatchIds || [],
      }),
      replaceBets: async () => {},
      persistIndex: () => {},
    });
    assert.equal(stats.softRetained, 1);
    assert.ok(writes[0]?.sids.includes("752423"));
    assert.deepEqual(writes[0]?.alsoKeep, ["752423"]);
  });
});
