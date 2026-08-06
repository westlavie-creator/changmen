import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  fetchPolymarketEsportsMarkets,
  normalizeSportsMarketType,
  polymarketEventForceDeletable,
  polymarketEventOpenForCollect,
  resetPolymarketEsportsApiCachesForTests,
  takeWholeMatchesUpTo,
} from "./api.js";

describe("polymarket-esports api helpers", () => {
  it("normalizeSportsMarketType never defaults to moneyline", () => {
    assert.equal(normalizeSportsMarketType({}), "");
    assert.equal(normalizeSportsMarketType({ sports_market_type: "spread" }), "spread");
    assert.equal(normalizeSportsMarketType({ sportsMarketType: "Child_Moneyline" }), "child_moneyline");
    assert.equal(
      normalizeSportsMarketType({ sportsMarketType: "moneyline", sports_market_type: "spread" }),
      "moneyline",
    );
  });

  it("polymarketEventOpenForCollect requires not closed and not ended", () => {
    assert.equal(polymarketEventOpenForCollect(null), false);
    assert.equal(polymarketEventOpenForCollect({}), true);
    assert.equal(polymarketEventOpenForCollect({ closed: false, ended: false }), true);
    assert.equal(polymarketEventOpenForCollect({ closed: true, ended: false }), false);
    assert.equal(polymarketEventOpenForCollect({ closed: false, ended: true }), false);
    // live 不是充分条件：ended 仍应丢弃
    assert.equal(polymarketEventOpenForCollect({ live: true, ended: true, closed: false }), false);
  });

  it("polymarketEventForceDeletable only trusts stable closed, never fluttering ended", () => {
    assert.equal(polymarketEventForceDeletable(null), false);
    assert.equal(polymarketEventForceDeletable({}), false);
    assert.equal(polymarketEventForceDeletable({ closed: true }), true);
    // ended 会抖：结算过渡期 ended=true 但 closed=false，不得强删（否则 ID 反复重建）
    assert.equal(polymarketEventForceDeletable({ closed: false, ended: true }), false);
    assert.equal(polymarketEventForceDeletable({ closed: true, ended: true }), true);
  });

  it("takeWholeMatchesUpTo keeps whole SourceMatchID groups", () => {
    const rows = [
      { id: "a1", match: "e1" },
      { id: "a2", match: "e1" },
      { id: "b1", match: "e2" },
      { id: "b2", match: "e2" },
      { id: "c1", match: "e3" },
    ];
    const taken = takeWholeMatchesUpTo(rows, r => r.match, 3);
    assert.deepEqual(taken.map(r => r.id), ["a1", "a2"]);
    const taken4 = takeWholeMatchesUpTo(rows, r => r.match, 4);
    assert.deepEqual(taken4.map(r => r.id), ["a1", "a2", "b1", "b2"]);
  });

  it("takeWholeMatchesUpTo slices oversized first match instead of returning empty", () => {
    const rows = [
      { id: "a1", match: "e1" },
      { id: "a2", match: "e1" },
      { id: "a3", match: "e1" },
    ];
    const taken = takeWholeMatchesUpTo(rows, r => r.match, 2);
    assert.deepEqual(taken.map(r => r.id), ["a1", "a2"]);
  });

  it("fetchPolymarketEsportsMarkets uses closed=false, start window primary, live supplement", async () => {
    resetPolymarketEsportsApiCachesForTests();
    const now = Date.parse("2026-07-27T07:10:00.000Z");
    const realNow = Date.now;
    const realFetch = globalThis.fetch;
    const urls = [];
    Date.now = () => now;
    globalThis.fetch = async (url) => {
      urls.push(String(url));
      if (String(url).includes("/sports?") || String(url).endsWith("/sports")) {
        return { ok: true, json: async () => [{ sport: "cs2", series: "10310" }] };
      }
      if (String(url).includes("/events/keyset?")) {
        return { ok: true, json: async () => ({ events: [], next_cursor: "" }) };
      }
      throw new Error(`unexpected url ${url}`);
    };
    try {
      const out = await fetchPolymarketEsportsMarkets();
      assert.equal(out.rawEventCount, 0);
      const keysetUrls = urls.filter(u => u.includes("/events/keyset?"));
      assert.equal(keysetUrls.length, 2, "window pass + live pass");
      for (const u of keysetUrls) {
        const parsed = new URL(u);
        assert.equal(parsed.searchParams.get("closed"), "false");
        assert.ok(parsed.searchParams.getAll("series_id").length >= 1);
      }
      const windowUrl = keysetUrls.find(u => u.includes("start_time_min="));
      assert.ok(windowUrl, "primary pass should use start_time window");
      const parsed = new URL(windowUrl);
      assert.equal(parsed.searchParams.get("start_time_min"), new Date(now - 6 * 3600 * 1000).toISOString());
      assert.equal(parsed.searchParams.get("start_time_max"), new Date(now + 60 * 60 * 1000).toISOString());
      const liveUrl = keysetUrls.find(u => /[?&]live=true(?:&|$)/.test(u));
      assert.ok(liveUrl, "supplement pass should request live=true");
    }
    finally {
      Date.now = realNow;
      globalThis.fetch = realFetch;
      resetPolymarketEsportsApiCachesForTests();
    }
  });

  it("drops ended from collection but only closed enters force-delete exclude", async () => {
    resetPolymarketEsportsApiCachesForTests();
    const now = Date.parse("2026-07-27T07:10:00.000Z");
    const realNow = Date.now;
    const realFetch = globalThis.fetch;
    Date.now = () => now;
    globalThis.fetch = async (url) => {
      if (String(url).includes("/sports?") || String(url).endsWith("/sports")) {
        return { ok: true, json: async () => [{ sport: "hok", series: "10434" }] };
      }
      if (String(url).includes("start_time_min=")) {
        return {
          ok: true,
          json: async () => ({
            events: [
              {
                // ended 会抖：剔除采集，但不得进 exclude（否则 ID 反复重建）
                id: "ended-1",
                closed: false,
                ended: true,
                live: false,
                startTime: new Date(now - 3600_000).toISOString(),
                markets: [{
                  condition_id: "c-ended",
                  sportsMarketType: "moneyline",
                  clob_token_ids: '["h","a"]',
                  outcomes: '["A","B"]',
                  closed: false,
                }],
              },
              {
                // closed 是稳定终态：剔除采集且进 exclude、可立即强删
                id: "closed-1",
                closed: true,
                ended: true,
                live: false,
                startTime: new Date(now - 3600_000).toISOString(),
                markets: [{
                  condition_id: "c-closed",
                  sportsMarketType: "moneyline",
                  clob_token_ids: '["hc","ac"]',
                  outcomes: '["A","B"]',
                  closed: true,
                }],
              },
              {
                id: "open-1",
                closed: false,
                ended: false,
                live: false,
                startTime: new Date(now - 3600_000).toISOString(),
                markets: [{
                  condition_id: "c-open",
                  sportsMarketType: "moneyline",
                  clob_token_ids: '["h2","a2"]',
                  outcomes: '["A","B"]',
                  closed: false,
                }],
              },
            ],
            next_cursor: "",
          }),
        };
      }
      if (String(url).includes("live=true")) {
        return { ok: true, json: async () => ({ events: [], next_cursor: "" }) };
      }
      throw new Error(`unexpected url ${url}`);
    };
    try {
      const out = await fetchPolymarketEsportsMarkets();
      assert.equal(out.rawEventCount, 3);
      assert.equal(out.rawMarketCount, 1);
      assert.equal(out.markets[0].condition_id, "c-open");
      // ended-1 不进 exclude；只有 closed-1 进
      assert.deepEqual(out.excludeSourceMatchIds, ["closed-1"]);
    }
    finally {
      Date.now = realNow;
      globalThis.fetch = realFetch;
      resetPolymarketEsportsApiCachesForTests();
    }
  });
});

