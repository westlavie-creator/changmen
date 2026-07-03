import { describe, expect, it } from "vitest";
import {
  interpretPolymarketUserWsMessage,
  polymarketOrderRowFromUserWsMessage,
  polymarketUserOrderIdsFromMessage,
} from "./userWsMessages";

const ORDER_ID = "0xabc123";

describe("polymarketUserOrderIdsFromMessage", () => {
  it("collects taker, order id, and maker order ids", () => {
    expect(polymarketUserOrderIdsFromMessage({
      id: "0xmaker",
      taker_order_id: "0xtaker",
      maker_orders: [{ order_id: "0xmaker-leg" }],
    })).toEqual(["0xtaker", "0xmaker", "0xmaker-leg"]);
  });
});

describe("interpretPolymarketUserWsMessage", () => {
  it("matched on trade CONFIRMED for taker order", () => {
    expect(interpretPolymarketUserWsMessage({
      event_type: "trade",
      type: "TRADE",
      status: "CONFIRMED",
      taker_order_id: ORDER_ID,
      size: "10",
    }, ORDER_ID)).toBe("matched");
  });

  it("unfilled on trade FAILED", () => {
    expect(interpretPolymarketUserWsMessage({
      event_type: "trade",
      type: "TRADE",
      status: "FAILED",
      taker_order_id: ORDER_ID,
    }, ORDER_ID)).toBe("unfilled");
  });

  it("unfilled on order CANCELLATION", () => {
    expect(interpretPolymarketUserWsMessage({
      event_type: "order",
      type: "CANCELLATION",
      id: ORDER_ID,
    }, ORDER_ID)).toBe("unfilled");
  });

  it("matched on order UPDATE with size_matched", () => {
    expect(interpretPolymarketUserWsMessage({
      event_type: "order",
      type: "UPDATE",
      id: ORDER_ID,
      size_matched: "5",
    }, ORDER_ID)).toBe("matched");
  });

  it("ignores unrelated order id", () => {
    expect(interpretPolymarketUserWsMessage({
      event_type: "trade",
      type: "TRADE",
      status: "CONFIRMED",
      taker_order_id: "0xother",
    }, ORDER_ID)).toBeNull();
  });
});

describe("polymarketOrderRowFromUserWsMessage", () => {
  it("builds matched row with size", () => {
    const row = polymarketOrderRowFromUserWsMessage({
      status: "CONFIRMED",
      size: "8.5",
      id: "trade-1",
    }, "matched");
    expect(row.status).toBe("CONFIRMED");
    expect(row.size_matched).toBe("8.5");
    expect(row.associate_trades).toEqual(["trade-1"]);
  });
});
