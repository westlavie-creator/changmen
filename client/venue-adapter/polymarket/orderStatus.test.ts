import { describe, expect, it, vi } from "vitest";
import {
  applyPolymarketSettlementToResult,
  buildPolymarketRejectVenueOrder,
  formatPolymarketSettlementMessage,
  interpretPolymarketOrderRow,
  isPolymarketDelayedPending,
  settlePolymarketDelayedOrder,
} from "./orderStatus";
import { BetResult } from "@/models/betResult";

const fetchPolymarketConfirmedTradeForOrder = vi.fn();
const awaitPolymarketOrderWatch = vi.fn();

vi.mock("./orders", () => ({
  fetchPolymarketConfirmedTradeForOrder: (...args: unknown[]) =>
    fetchPolymarketConfirmedTradeForOrder(...args),
}));

vi.mock("./userWs", () => ({
  awaitPolymarketOrderWatch: (...args: unknown[]) => awaitPolymarketOrderWatch(...args),
  clearPolymarketOrderWatch: vi.fn(),
}));

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

describe("settlePolymarketDelayedOrder", () => {
  it("uses ws outcome when watch already matched", async () => {
    awaitPolymarketOrderWatch.mockReset();
    awaitPolymarketOrderWatch.mockResolvedValueOnce({
      source: "ws",
      outcome: "matched",
      row: { status: "MATCHED", size_matched: "10" },
    });

    const out = await settlePolymarketDelayedOrder({ provider: "Polymarket" } as never, "0xws");

    expect(out.outcome).toBe("matched");
    expect(fetchPolymarketConfirmedTradeForOrder).not.toHaveBeenCalled();
  });

  it("falls back to trades when ws returns null", async () => {
    const acc = { provider: "Polymarket" } as never;
    awaitPolymarketOrderWatch.mockReset();
    awaitPolymarketOrderWatch.mockResolvedValueOnce(null);
    fetchPolymarketConfirmedTradeForOrder.mockReset();
    fetchPolymarketConfirmedTradeForOrder.mockResolvedValueOnce({
      id: "trade-1",
      size: "5.88",
      status: "MINED",
      side: "BUY",
      taker_order_id: "0xlate",
    });

    const out = await settlePolymarketDelayedOrder(acc, "0xlate", {
      poll: { initialDelayMs: 0, intervalMs: 0, maxAttempts: 1 },
      tradeConfirm: { lookbackMs: 60_000, retryMs: 0, maxRetries: 1 },
    });

    expect(out.outcome).toBe("matched");
    expect(out.row?.status).toBe("MATCHED");
    expect(fetchPolymarketConfirmedTradeForOrder).toHaveBeenCalledWith(acc, "0xlate", 60_000);
  });
});
