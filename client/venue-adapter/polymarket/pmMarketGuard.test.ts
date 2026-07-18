import { describe, expect, test } from "vitest";
import { getPolymarketMarketBlockReason } from "./pmMarketGuard";
import type { PolymarketRawMarket } from "./parse";

describe("getPolymarketMarketBlockReason", () => {
  test("blocks buying loser when winner price >= 0.99", () => {
    const market: PolymarketRawMarket = {
      clob_token_ids: JSON.stringify(["token-home", "token-away"]),
      outcomePrices: JSON.stringify(["0.0005", "0.9995"]),
      closed: false,
    };
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

  test("allows buying favorite when price resolved", () => {
    const market: PolymarketRawMarket = {
      clob_token_ids: JSON.stringify(["token-home", "token-away"]),
      outcomePrices: JSON.stringify(["0.0005", "0.9995"]),
      closed: false,
    };
    expect(getPolymarketMarketBlockReason(market, "token-away")).toBeNull();
  });

  test("blocks loser via official tokens[].winner without price ≥0.99", () => {
    const official: PolymarketRawMarket = {
      clob_token_ids: JSON.stringify(["token-home", "token-away"]),
      outcomePrices: JSON.stringify(["0.45", "0.55"]),
      closed: false,
      tokens: [
        { token_id: "token-home", outcome: "Home", price: 0.45, winner: false },
        { token_id: "token-away", outcome: "Away", price: 0.55, winner: true },
      ],
    };
    expect(getPolymarketMarketBlockReason(official, "token-home")).toContain("市场已决出胜负");
    expect(getPolymarketMarketBlockReason(official, "token-away")).toBeNull();
  });
});
