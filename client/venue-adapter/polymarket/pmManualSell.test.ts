import { describe, expect, it } from "vitest";
import { calculateSellMarketLimitPrice, buildSellAndBuyPatchOrders } from "./pmManualSell";
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

describe("buildSellAndBuyPatchOrders dust close", () => {
  it("marks closed when sold shares leave dust below 0.0001", () => {
    const [buy, sell] = buildSellAndBuyPatchOrders({
      buy: {
        provider: "Polymarket",
        orderId: "0xbuy",
        odds: 2.941,
        createAt: 1,
        betMoney: 112,
        reward: 0,
        money: 0,
        status: "none",
        match: "Heroic vs K27",
        bet: "map3",
        item: "Heroic",
        pmShares: 48.2353,
        pmFillPrice: 0.34,
        pmStakeUsdc: 16.4,
        pmOrigin: "changmen",
        pmSide: "buy",
        pmSellState: "open",
      },
      sellOrderId: "0xsell",
      sharesSold: 48.23,
      proceedsUsdc: 16.8805,
      fillPrice: 0.35,
      createAt: 2,
    });
    expect(buy.pmSellState).toBe("closed");
    expect(buy.pmAttributedSellShares).toBe(48.2353);
    expect(buy.pmStakeUsdc).toBe(0);
    expect(buy.betMoney).toBe(0);
    expect(sell.money).toBeGreaterThan(0);
    expect(sell.pmBuyOrderId).toBe("0xbuy");
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
