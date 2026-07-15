import { describe, expect, test, vi } from "vitest";
import {
  bindPolymarketSportResubscribe,
  emitPolymarketSportQuote,
  getPolymarketSportAssetIds,
  onPolymarketSportQuote,
  setPolymarketSportAssetIds,
} from "./sportQuoteHub";

describe("polymarket sportQuoteHub", () => {
  test("setSportAssetIds replaces set; emit only for registered ids", () => {
    setPolymarketSportAssetIds(["a1", "a2"]);
    expect(getPolymarketSportAssetIds().sort()).toEqual(["a1", "a2"]);

    const seen: string[] = [];
    const un = onPolymarketSportQuote(q => seen.push(q.assetId));
    emitPolymarketSportQuote("a1", 0.4);
    emitPolymarketSportQuote("other", 0.5);
    emitPolymarketSportQuote("a2", 0);
    expect(seen).toEqual(["a1"]);
    un();
    setPolymarketSportAssetIds([]);
  });

  test("identical set does not call resubscribe (esport WS isolation)", () => {
    let n = 0;
    bindPolymarketSportResubscribe(() => {
      n += 1;
    });
    setPolymarketSportAssetIds(["x", "y"]);
    expect(n).toBe(1);
    setPolymarketSportAssetIds(["y", "x"]);
    expect(n).toBe(1);
    setPolymarketSportAssetIds(["x"]);
    expect(n).toBe(2);
    bindPolymarketSportResubscribe(null);
    setPolymarketSportAssetIds([]);
  });

  test("emit never imports or calls saveVenueOdds (isolation smoke)", async () => {
    const oddsAccess = await import("@changmen/client-core/bridge/oddsAccess");
    const spy = vi.spyOn(oddsAccess, "saveVenueOdds");
    setPolymarketSportAssetIds(["tok"]);
    const un = onPolymarketSportQuote(() => {});
    emitPolymarketSportQuote("tok", 0.55);
    expect(spy).not.toHaveBeenCalled();
    un();
    spy.mockRestore();
    setPolymarketSportAssetIds([]);
  });
});
