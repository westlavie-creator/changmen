/**
 * sportQuoteHub 薄兼容层：只保留过滤 / 别名测；hub 生命周期见 marketQuoteHub.lifecycle.test.ts
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  __testPushPolymarketMarketQuote,
  __testResetPolymarketMarketQuoteHub,
} from "./marketQuoteHub";
import {
  clearPolymarketSportHub,
  getPolymarketSportAssetIds,
  onPolymarketSportHubBound,
  onPolymarketSportQuote,
  setPolymarketSportAssetIds,
} from "./sportQuoteHub";

afterEach(() => {
  __testResetPolymarketMarketQuoteHub();
  vi.restoreAllMocks();
});

describe("polymarket sportQuoteHub compat", () => {
  test("Set.has filter: only registered sport assets; skips invalid price", () => {
    setPolymarketSportAssetIds(["a1", "a2"]);
    expect(getPolymarketSportAssetIds().sort()).toEqual(["a1", "a2"]);

    const seen: string[] = [];
    const un = onPolymarketSportQuote(q => seen.push(q.assetId));
    __testPushPolymarketMarketQuote("a1", 0.4);
    __testPushPolymarketMarketQuote("other", 0.5);
    __testPushPolymarketMarketQuote("a2", 0);
    expect(seen).toEqual(["a1"]);
    un();
    clearPolymarketSportHub();
  });

  test("hubBound aliases market ready", async () => {
    const ws = await import("./ws");
    vi.spyOn(ws, "startPolymarketMarketWs").mockReturnValue({ send: vi.fn(), stop: vi.fn() } as any);

    let hits = 0;
    const un = onPolymarketSportHubBound(() => {
      hits += 1;
    });
    setPolymarketSportAssetIds(["e"]);
    await Promise.resolve();
    expect(hits).toBe(1);
    un();
    clearPolymarketSportHub();
  });
});
