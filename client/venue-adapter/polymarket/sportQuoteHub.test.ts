/**
 * sportQuoteHub 独立总线：过滤 + ready；lifecycle 与电竞 marketQuoteHub / ws.ts 隔离。
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  __testPushPolymarketSportQuote,
  __testResetPolymarketSportQuoteHub,
  clearPolymarketSportHub,
  getPolymarketSportAssetIds,
  onPolymarketSportHubBound,
  onPolymarketSportQuote,
  setPolymarketSportAssetIds,
} from "./sportQuoteHub";

afterEach(() => {
  __testResetPolymarketSportQuoteHub();
  vi.restoreAllMocks();
});

describe("polymarket sportQuoteHub (isolated)", () => {
  test("only registered sport assets; skips invalid price", () => {
    setPolymarketSportAssetIds(["a1", "a2"]);
    expect(getPolymarketSportAssetIds().sort()).toEqual(["a1", "a2"]);

    const seen: string[] = [];
    const un = onPolymarketSportQuote(q => seen.push(q.assetId));
    __testPushPolymarketSportQuote("a1", 0.4);
    __testPushPolymarketSportQuote("other", 0.5);
    __testPushPolymarketSportQuote("a2", 0);
    expect(seen).toEqual(["a1"]);
    un();
    clearPolymarketSportHub();
  });

  test("hubBound fires on ensure; uses sportMarketWs, not esport ws.ts", async () => {
    const sportWs = await import("./sportMarketWs");
    const esportWs = await import("./ws");
    const startSpy = vi.spyOn(sportWs, "startPolymarketSportMarketWs").mockReturnValue({
      send: vi.fn(),
      stop: vi.fn(),
    } as any);
    const esportStart = vi.spyOn(esportWs, "startPolymarketMarketWs");

    let hits = 0;
    const un = onPolymarketSportHubBound(() => {
      hits += 1;
    });
    setPolymarketSportAssetIds(["e"]);
    await Promise.resolve();
    expect(hits).toBe(1);
    expect(startSpy).toHaveBeenCalled();
    expect(esportStart).not.toHaveBeenCalled();
    un();
    clearPolymarketSportHub();
  });

  test("clear stops sport transport only", async () => {
    const sportWs = await import("./sportMarketWs");
    const stop = vi.fn();
    vi.spyOn(sportWs, "startPolymarketSportMarketWs").mockReturnValue({ send: vi.fn(), stop } as any);
    setPolymarketSportAssetIds(["x"]);
    clearPolymarketSportHub();
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
