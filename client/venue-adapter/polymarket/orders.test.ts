import { describe, expect, test } from "vitest";
import {
  aggregatePolymarketTrades,
  flattenPolymarketTrades,
  isPolymarketTradeConfirmed,
  mapPolymarketTradeToVenueOrder,
  mapPolymarketTradesToVenueOrders,
  polymarketBuyStakeUsdc,
  type PolymarketTradeRow,
} from "./orders";
import { polymarketOrderContextFromMarket } from "./parse";

describe("isPolymarketTradeConfirmed", () => {
  test("accepts confirmed, matched, and mined statuses", () => {
    expect(isPolymarketTradeConfirmed("TRADE_STATUS_CONFIRMED")).toBe(true);
    expect(isPolymarketTradeConfirmed("MATCHED")).toBe(true);
    expect(isPolymarketTradeConfirmed("MINED")).toBe(true);
    expect(isPolymarketTradeConfirmed("RETRYING")).toBe(true);
  });

  test("rejects failed and cancelled statuses", () => {
    expect(isPolymarketTradeConfirmed("TRADE_STATUS_FAILED")).toBe(false);
    expect(isPolymarketTradeConfirmed("CANCELLED")).toBe(false);
  });
});

describe("polymarketBuyStakeUsdc", () => {
  test("parses micro token size from REST", () => {
    expect(polymarketBuyStakeUsdc("2000000", 0.5)).toBe(1);
  });

  test("parses human-readable share size from WS-like payloads", () => {
    expect(polymarketBuyStakeUsdc("10", 0.57)).toBeCloseTo(5.7, 4);
  });
});

describe("flattenPolymarketTrades", () => {
  test("uses maker_orders when trader_side is MAKER", () => {
    const rows = flattenPolymarketTrades([{
      trader_side: "MAKER",
      side: "BUY",
      status: "MINED",
      match_time: "1700000000",
      market: "0xmarket",
      taker_order_id: "0xtaker",
      maker_orders: [{
        order_id: "0xmaker-order",
        matched_amount: "2000000",
        price: "0.5",
        outcome: "Team A",
      }],
    }]);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.taker_order_id).toBe("0xmaker-order");
  });
});

describe("aggregatePolymarketTrades", () => {
  test("merges bucket trades by taker_order_id and ignores sells", () => {
    const trades: PolymarketTradeRow[] = [
      {
        taker_order_id: "0xabc",
        side: "BUY",
        status: "TRADE_STATUS_CONFIRMED",
        size: "500000",
        price: "0.5",
        match_time: "1700000000",
        outcome: "Team A",
      },
      {
        taker_order_id: "0xabc",
        side: "BUY",
        status: "TRADE_STATUS_CONFIRMED",
        size: "500000",
        price: "0.5",
        match_time: "1700000001",
        outcome: "Team A",
        bucket_index: 1,
      },
      {
        taker_order_id: "0xsell",
        side: "SELL",
        status: "TRADE_STATUS_CONFIRMED",
        size: "1000000",
        price: "0.5",
        match_time: "1700000002",
      },
    ];

    const aggregated = aggregatePolymarketTrades(trades);
    expect(aggregated).toHaveLength(1);
    expect(aggregated[0]?.taker_order_id).toBe("0xabc");
    expect(aggregated[0]?.size).toBe("1000000");
    expect(aggregated[0]?.match_time).toBe("1700000001");
  });
});

describe("mapPolymarketTradeToVenueOrder", () => {
  test("maps MINED BUY trade to unsettled VenueOrder", () => {
    const order = mapPolymarketTradeToVenueOrder({
      taker_order_id: "0xorder-mined",
      market: "0xmarket",
      side: "BUY",
      status: "MINED",
      size: "10",
      price: "0.5",
      match_time: "1700000000",
      outcome: "Team A",
    });

    expect(order).toMatchObject({
      orderId: "0xorder-mined",
      betMoney: 5,
      status: "none",
    });
  });

  test("maps BUY trade to unsettled VenueOrder", () => {
    const market = {
      condition_id: "0xmarket",
      question: "Counter-Strike: Team A vs Team B (BO3)",
      sports_market_type: "child_moneyline",
      group_item_title: "Map 1 Winner",
      tags: [{ label: "cs2" }],
    };

    const order = mapPolymarketTradeToVenueOrder({
      taker_order_id: "0xorder1",
      market: "0xmarket",
      side: "BUY",
      status: "TRADE_STATUS_CONFIRMED",
      size: "2000000",
      price: "0.5",
      match_time: "1700000000",
      outcome: "Team A",
    }, market);

    expect(order).toMatchObject({
      provider: "Polymarket",
      orderId: "0xorder1",
      odds: 2,
      betMoney: 1,
      reward: 2,
      money: 0,
      status: "none",
      game: "cs2",
      match: "Counter-Strike: Team A vs Team B (BO3)",
      bet: "地图1",
      item: "Team A",
      createAt: 1_700_000_000_000,
    });
  });

  test("falls back when gamma market is missing", () => {
    const order = mapPolymarketTradeToVenueOrder({
      taker_order_id: "0xorder2",
      market: "0x1234567890",
      side: "BUY",
      status: "MATCHED",
      size: "1000000",
      price: "0.25",
      match_time: "1700000100",
      outcome: "Yes",
    });

    expect(order?.match).toBe("0x12345678…");
    expect(order?.bet).toBe("");
    expect(order?.odds).toBe(4);
    expect(order?.betMoney).toBe(0.25);
  });
});

describe("polymarketOrderContextFromMarket", () => {
  test("labels moneyline as 全场", () => {
    expect(polymarketOrderContextFromMarket({
      question: "Match winner",
      sports_market_type: "moneyline",
      tags: [{ label: "lol" }],
    })).toMatchObject({
      game: "lol",
      bet: "全场",
    });
  });
});

describe("mapPolymarketTradesToVenueOrders", () => {
  test("maps production CLOB decimal share sizes (Ilbirs sample)", () => {
    const order = mapPolymarketTradeToVenueOrder({
      taker_order_id: "0xf6ce662fe4d026b86430fc49e29bc3600db21d76ef69fcb7e0230689289d8a53",
      market: "0xfaf8d69ad2f0677b6f987e7da1c94022f73073120e9ed28969fcf5153475116f",
      side: "BUY",
      size: "6.756753",
      price: "0.74",
      status: "CONFIRMED",
      match_time: "1782736191",
      outcome: "Ilbirs eSports",
      trader_side: "TAKER",
    });

    expect(order).toMatchObject({
      orderId: "0xf6ce662fe4d026b86430fc49e29bc3600db21d76ef69fcb7e0230689289d8a53",
      betMoney: 5,
      odds: 1.3514,
      item: "Ilbirs eSports",
      createAt: 1_782_736_191_000,
    });
  });

  test("keeps BUY bets and drops SELL redemptions from mixed trade feed", () => {
    const sample: PolymarketTradeRow[] = [
      {
        taker_order_id: "0xbuy1",
        side: "BUY",
        status: "CONFIRMED",
        size: "6.756753",
        price: "0.74",
        match_time: "1782736191",
        outcome: "Ilbirs eSports",
        trader_side: "TAKER",
      },
      {
        taker_order_id: "0xsell1",
        side: "SELL",
        status: "CONFIRMED",
        size: "6.41",
        price: "0.999",
        match_time: "1782690537",
        outcome: "MIBR Academy",
        trader_side: "TAKER",
      },
      {
        taker_order_id: "0xbuy2",
        side: "BUY",
        status: "CONFIRMED",
        size: "14.545453",
        price: "0.55",
        match_time: "1782684713",
        outcome: "ShindeN",
        trader_side: "TAKER",
      },
    ];

    const orders = mapPolymarketTradesToVenueOrders(sample);
    expect(orders).toHaveLength(2);
    expect(orders.map(o => o.orderId)).toEqual(["0xbuy1", "0xbuy2"]);
    expect(orders[0]?.betMoney).toBe(5);
    expect(orders[1]?.betMoney).toBeCloseTo(8, 0);
  });
});
