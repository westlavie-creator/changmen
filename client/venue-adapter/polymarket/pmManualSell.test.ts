import { describe, expect, it } from "vitest";
import { calculateSellMarketLimitPrice } from "./pmManualSell";
import { stripPolymarketSellOrders } from "./pmLogicalPosition";

describe("calculateSellMarketLimitPrice", () => {
  const bids = [
    { price: 0.55, size: 5 },
    { price: 0.54, size: 10 },
    { price: 0.5, size: 20 },
  ];

  it("returns worst bid price needed to fill shares", () => {
    expect(calculateSellMarketLimitPrice(bids, 4, 1)).toBe(0.55);
    expect(calculateSellMarketLimitPrice(bids, 8, 1)).toBe(0.54);
    expect(calculateSellMarketLimitPrice(bids, 20, 1)).toBe(0.5);
  });

  it("throws when depth insufficient", () => {
    expect(() => calculateSellMarketLimitPrice(bids, 40, 1)).toThrow(/深度不足/);
  });

  it("throws below min_order_size", () => {
    expect(() => calculateSellMarketLimitPrice(bids, 0.5, 1)).toThrow(/min_order_size/);
  });
});

describe("stripPolymarketSellOrders keeps changmen sells", () => {
  it("keeps changmen sell and strips external sell", () => {
    const rows = stripPolymarketSellOrders([
      { orderId: "b", pmSide: "buy" as const, pmOrigin: "changmen" as const },
      { orderId: "s1", pmSide: "sell" as const, pmOrigin: "changmen" as const },
      { orderId: "s2", pmSide: "sell" as const, pmOrigin: "external" as const },
    ] as any);
    expect(rows.map((r: any) => r.orderId)).toEqual(["b", "s1"]);
  });
});
