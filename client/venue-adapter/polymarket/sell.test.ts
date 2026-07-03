import { describe, expect, test } from "vitest";
import {
  buildPolymarketSellQuote,
  calculateSellMarketLimitPrice,
} from "./sell";
import { parsePolymarketSellOrderFill } from "./orders";

describe("calculateSellMarketLimitPrice", () => {
  test("returns worst bid level for full fill", () => {
    const bids = [
      { price: 0.8, size: 2 },
      { price: 0.75, size: 10 },
    ];
    expect(calculateSellMarketLimitPrice(bids, 5, 0)).toBe(0.75);
  });

  test("single level fill uses that price", () => {
    expect(calculateSellMarketLimitPrice([{ price: 0.62, size: 20 }], 3, 0)).toBe(0.62);
  });

  test("throws when depth insufficient", () => {
    expect(() =>
      calculateSellMarketLimitPrice([{ price: 0.5, size: 1 }], 5, 0),
    ).toThrow(/深度不足/);
  });
});

describe("parsePolymarketSellOrderFill", () => {
  test("parses SELL making=份数 taking=USDC micro", () => {
    expect(parsePolymarketSellOrderFill({
      makingAmount: "12500000",
      takingAmount: "10000000",
    })).toEqual({ sharesSold: 12.5, proceedsUsdc: 10 });
  });

  test("human-readable amounts pass through", () => {
    expect(parsePolymarketSellOrderFill({
      makingAmount: "12.5",
      takingAmount: "10",
    })).toEqual({ sharesSold: 12.5, proceedsUsdc: 10 });
  });
});

describe("buildPolymarketSellQuote", () => {
  test("computes sell odds and profit from best bid", () => {
    const quote = buildPolymarketSellQuote(
      "token-1",
      10,
      5,
      [{ price: 0.6, size: 20 }],
      0,
    );
    expect(quote.sellOdds).toBeCloseTo(1.6667, 3);
    expect(quote.proceedsUsdc).toBe(6);
    expect(quote.profitUsdc).toBe(1);
    expect(quote.canSell).toBe(true);
  });
});
