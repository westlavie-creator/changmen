import { describe, expect, test } from "vitest";
import {
  aggregatePolymarketTrades,
  isPolymarketTradeConfirmed,
  mapPolymarketTradeToVenueOrder,
  type PolymarketTradeRow,
} from "./orders";
import { polymarketOrderContextFromMarket } from "./parse";

describe("isPolymarketTradeConfirmed", () => {
  test("accepts confirmed and matched statuses", () => {
    expect(isPolymarketTradeConfirmed("TRADE_STATUS_CONFIRMED")).toBe(true);
    expect(isPolymarketTradeConfirmed("MATCHED")).toBe(true);
  });

  test("rejects failed and cancelled statuses", () => {
    expect(isPolymarketTradeConfirmed("TRADE_STATUS_FAILED")).toBe(false);
    expect(isPolymarketTradeConfirmed("CANCELLED")).toBe(false);
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
