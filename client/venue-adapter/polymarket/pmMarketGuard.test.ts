import { describe, expect, test } from "vitest";
import { getPolymarketMarketBlockReason } from "./pmMarketGuard";
import type { PolymarketRawMarket } from "./parse";

describe("getPolymarketMarketBlockReason", () => {
  const market: PolymarketRawMarket = {
    clob_token_ids: JSON.stringify(["token-home", "token-away"]),
    outcomePrices: JSON.stringify(["0.0005", "0.9995"]),
    closed: false,
  };

  test("blocks buying loser when winner price >= 0.99", () => {
    const reason = getPolymarketMarketBlockReason(market, "token-home");
    expect(reason).toContain("市场已决出胜负");
  });

  test("soft-blocks heavy underdog without resolved market", () => {
    const softMarket: PolymarketRawMarket = {
      clob_token_ids: JSON.stringify(["token-home", "token-away"]),
      outcomePrices: JSON.stringify(["0.05", "0.92"]),
      closed: false,
    };
    expect(getPolymarketMarketBlockReason(softMarket, "token-home")).toContain("几乎不可能");
  });

  test("allows buying favorite", () => {
    expect(getPolymarketMarketBlockReason(market, "token-away")).toBeNull();
  });
});
