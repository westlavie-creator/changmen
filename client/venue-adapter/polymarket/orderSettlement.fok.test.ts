import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchPolymarketConfirmedTradeForOrder = vi.fn();
const fetchPolymarketOrderRow = vi.fn();
const pmCancelOrder = vi.fn();
const awaitPolymarketOrderWatch = vi.fn();

vi.mock("./orders", () => ({
  fetchPolymarketConfirmedTradeForOrder: (...args: unknown[]) =>
    fetchPolymarketConfirmedTradeForOrder(...args),
}));

vi.mock("./pmClientApi", () => ({
  pmCancelOrder: (...args: unknown[]) => pmCancelOrder(...args),
}));

vi.mock("./userWs", () => ({
  awaitPolymarketOrderWatch: (...args: unknown[]) => awaitPolymarketOrderWatch(...args),
  clearPolymarketOrderWatch: vi.fn(),
}));

vi.mock("./orderStatus", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./orderStatus")>();
  return {
    ...actual,
    fetchPolymarketOrderRow: (...args: unknown[]) => fetchPolymarketOrderRow(...args),
    pollPolymarketDelayedOrder: vi.fn(async () => ({
      outcome: "timeout" as const,
      row: { status: "live", size_matched: "0" },
    })),
  };
});

import {
  finalizePolymarketFokRestingOrder,
  settlePolymarketDelayedOrder,
} from "./orderSettlement";

describe("finalizePolymarketFokRestingOrder", () => {
  const acc = { provider: "Polymarket", accountId: 1, token: "{}" } as never;

  beforeEach(() => {
    fetchPolymarketConfirmedTradeForOrder.mockReset();
    fetchPolymarketOrderRow.mockReset();
    pmCancelOrder.mockReset();
    fetchPolymarketConfirmedTradeForOrder.mockResolvedValue(null);
  });

  it("during grace sees system cancel → unfilled without pmCancel", async () => {
    fetchPolymarketOrderRow.mockResolvedValue({ status: "cancelled", size_matched: "0" });

    const out = await finalizePolymarketFokRestingOrder(
      acc,
      "0x1",
      { status: "live", size_matched: "0" },
      { graceMs: 80, graceIntervalMs: 20, postCancelAttempts: 1 },
    );

    expect(out.outcome).toBe("unfilled");
    expect(pmCancelOrder).not.toHaveBeenCalled();
  });

  it("cancels once after grace then unfilled", async () => {
    fetchPolymarketOrderRow
      .mockResolvedValueOnce({ status: "live", size_matched: "0" })
      .mockResolvedValue({ status: "cancelled", size_matched: "0" });
    pmCancelOrder.mockResolvedValue({});

    const out = await finalizePolymarketFokRestingOrder(
      acc,
      "0xrest",
      { status: "unmatched", size_matched: "0" },
      { graceMs: 0, graceIntervalMs: 0, postCancelAttempts: 2, postCancelIntervalMs: 0 },
    );

    expect(pmCancelOrder).toHaveBeenCalledWith(acc, "0xrest");
    expect(out.outcome).toBe("unfilled");
  });

  it("cancel race: trade appears → matched", async () => {
    fetchPolymarketOrderRow.mockResolvedValue({ status: "live", size_matched: "0" });
    pmCancelOrder.mockResolvedValue({});
    fetchPolymarketConfirmedTradeForOrder
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "t1",
        size: "4",
        status: "MATCHED",
        side: "BUY",
      });

    const out = await finalizePolymarketFokRestingOrder(
      acc,
      "0xrace",
      { status: "live", size_matched: "0" },
      { graceMs: 0, graceIntervalMs: 0, postCancelAttempts: 2, postCancelIntervalMs: 0 },
    );

    expect(out.outcome).toBe("matched");
    expect(out.row?.size_matched).toBe("4");
  });

  it("delayed/non-resting stays timeout without cancel", async () => {
    const out = await finalizePolymarketFokRestingOrder(
      acc,
      "0xd",
      { status: "delayed", size_matched: "0" },
      { graceMs: 0 },
    );
    expect(out.outcome).toBe("timeout");
    expect(pmCancelOrder).not.toHaveBeenCalled();
  });
});

describe("settlePolymarketDelayedOrder FOK resting", () => {
  const acc = { provider: "Polymarket", accountId: 1, token: "{}" } as never;

  beforeEach(() => {
    awaitPolymarketOrderWatch.mockReset();
    awaitPolymarketOrderWatch.mockResolvedValue(null);
    fetchPolymarketConfirmedTradeForOrder.mockReset();
    fetchPolymarketConfirmedTradeForOrder.mockResolvedValue(null);
    fetchPolymarketOrderRow.mockReset();
    pmCancelOrder.mockReset();
  });

  it("runs FOK cancel path when poll leaves live resting", async () => {
    fetchPolymarketOrderRow.mockResolvedValue({ status: "cancelled", size_matched: "0" });
    pmCancelOrder.mockResolvedValue({});

    const out = await settlePolymarketDelayedOrder(acc, "0xlive", {
      tradeConfirm: { lookbackMs: 60_000, retryMs: 0, maxRetries: 1 },
      fokGrace: { graceMs: 0, graceIntervalMs: 0, postCancelAttempts: 1, postCancelIntervalMs: 0 },
    });

    expect(out.outcome).toBe("unfilled");
    expect(pmCancelOrder).toHaveBeenCalledWith(acc, "0xlive");
  });

  it("ws unfilled but REST still live → FOK finalize not blind unfilled", async () => {
    awaitPolymarketOrderWatch.mockResolvedValue({
      source: "ws",
      outcome: "unfilled",
      row: { status: "cancelled", size_matched: "0" },
    });
    // poll mock already returns live; trade none; must cancel+recheck
    fetchPolymarketOrderRow.mockResolvedValue({ status: "cancelled", size_matched: "0" });
    pmCancelOrder.mockResolvedValue({});

    const out = await settlePolymarketDelayedOrder(acc, "0xws-lag", {
      tradeConfirm: { lookbackMs: 60_000, retryMs: 0, maxRetries: 1 },
      fokGrace: { graceMs: 0, graceIntervalMs: 0, postCancelAttempts: 1, postCancelIntervalMs: 0 },
    });

    expect(out.outcome).toBe("unfilled");
    expect(pmCancelOrder).toHaveBeenCalledWith(acc, "0xws-lag");
  });
});
