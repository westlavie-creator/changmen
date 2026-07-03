import { describe, expect, it } from "vitest";
import {
  applyPolymarketSettlementToResult,
  buildPolymarketRejectVenueOrder,
  formatPolymarketSettlementMessage,
  interpretPolymarketOrderRow,
  isPolymarketDelayedPending,
} from "./orderStatus";
import { BetResult } from "@/models/betResult";

describe("isPolymarketDelayedPending", () => {
  it("true for delayed without takingAmount", () => {
    expect(isPolymarketDelayedPending({
      success: true,
      status: "delayed",
      orderID: "0xabc",
      takingAmount: "",
    })).toBe(true);
  });

  it("false for matched fill", () => {
    expect(isPolymarketDelayedPending({
      success: true,
      status: "matched",
      orderID: "0xabc",
      takingAmount: "10",
    })).toBe(false);
  });
});

describe("interpretPolymarketOrderRow", () => {
  it("matched when size_matched > 0", () => {
    expect(interpretPolymarketOrderRow({ status: "MATCHED", size_matched: "12.5" }))
      .toBe("matched");
  });

  it("unfilled for empty body", () => {
    expect(interpretPolymarketOrderRow(null)).toBe("unfilled");
    expect(interpretPolymarketOrderRow({})).toBe("unfilled");
  });

  it("unfilled for matched with zero size", () => {
    expect(interpretPolymarketOrderRow({ status: "matched", size_matched: "0" }))
      .toBe("unfilled");
  });

  it("pending for delayed status", () => {
    expect(interpretPolymarketOrderRow({ status: "delayed" })).toBe("pending");
  });
});

describe("formatPolymarketSettlementMessage", () => {
  it("formats matched and unfilled", () => {
    expect(formatPolymarketSettlementMessage("0x1", "matched", { status: "MATCHED", size_matched: "3" }))
      .toContain("已成交");
    expect(formatPolymarketSettlementMessage("0x1", "unfilled", null))
      .toContain("未成交");
  });
});

describe("applyPolymarketSettlementToResult", () => {
  it("clears pending and sets reject on unfilled", () => {
    const result = Object.assign(new BetResult("Polymarket", true), {
      pending: true,
      orderId: "0x1",
    });
    applyPolymarketSettlementToResult(result, "unfilled", null);
    expect(result.pending).toBe(false);
    expect(result.reject).toBe("unfilled");
    expect(result.message).toContain("未成交");
  });
});

describe("buildPolymarketRejectVenueOrder", () => {
  it("builds reject status order", () => {
    const acc = { provider: "Polymarket" } as never;
    const result = Object.assign(new BetResult("Polymarket", true), { orderId: "0x1" });
    const order = buildPolymarketRejectVenueOrder(acc, result, "unfilled");
    expect(order.status).toBe("reject");
    expect(order.orderId).toBe("0x1");
  });
});
