import { describe, expect, it, vi } from "vitest";
import { BetResult } from "@changmen/client-core/models/betResult";
import { isA8VenueReject, resolveA8VenueLegOutcome } from "./a8LegOutcome";

describe("a8LegOutcome", () => {
  it("isA8VenueReject uses orders[0]", () => {
    expect(isA8VenueReject([
      { status: "reject" } as never,
      { status: "none" } as never,
    ])).toBe(true);
    expect(isA8VenueReject([{ status: "none" } as never])).toBe(false);
  });

  it("resolveA8VenueLegOutcome ignores result.orderId", async () => {
    const provider = {
      getOrders: vi.fn().mockResolvedValue([
        { orderId: "stale", status: "reject", createAt: 2 } as never,
        { orderId: "new", status: "none", createAt: 1 } as never,
      ]),
    };

    const out = await resolveA8VenueLegOutcome(
      provider,
      { provider: "OB" } as never,
      Object.assign(new BetResult("OB", true), { orderId: "new" }),
    );

    expect(out.settlement).toBe("unfilled");
  });

  it("waits rejectWaitSec before pulling orders", async () => {
    vi.useFakeTimers();
    const getOrders = vi.fn().mockResolvedValue([{ status: "none", createAt: 1 } as never]);
    const provider = { getOrders };

    const pending = resolveA8VenueLegOutcome(
      provider,
      { provider: "OB" } as never,
      undefined,
      { rejectWaitSec: 3 },
    );
    await vi.advanceTimersByTimeAsync(2999);
    expect(getOrders).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(getOrders).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
