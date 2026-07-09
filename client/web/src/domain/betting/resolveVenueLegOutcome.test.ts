import { beforeEach, describe, expect, it, vi } from "vitest";
import { BetResult } from "@/models/betResult";
import { resolveVenueLegOutcome } from "./resolveVenueLegOutcome";

const getProvider = vi.hoisted(() => vi.fn());

vi.mock("@/runtime/providers", () => ({
  getProvider,
}));

describe("resolveVenueLegOutcome", () => {
  beforeEach(() => {
    getProvider.mockReset();
  });

  it("confirmPmPost skips entry pre-fetch; provider gets fetchVenueOrders callback", async () => {
    const resolveLegOutcome = vi.fn().mockResolvedValue({
      orders: [],
      settlement: "filled",
    });
    getProvider.mockReturnValue({ resolveLegOutcome });
    const fetchVenueOrders = vi.fn().mockResolvedValue([
      { orderId: "1", status: "none", createAt: 1 } as never,
    ]);

    const out = await resolveVenueLegOutcome(
      { provider: "Polymarket" } as never,
      new BetResult("Polymarket", true),
      fetchVenueOrders,
      { confirmPmPost: true },
    );

    expect(fetchVenueOrders).not.toHaveBeenCalled();
    expect(resolveLegOutcome).toHaveBeenCalledWith(
      { provider: "Polymarket" },
      expect.any(BetResult),
      expect.objectContaining({ confirmPmPost: true, fetchVenueOrders: expect.any(Function) }),
    );
    expect(out.settlement).toBe("filled");
  });

  it("confirmPmPost fill-confirmed path: provider pull runs once when callback used", async () => {
    const fetchVenueOrders = vi.fn().mockResolvedValue([
      { orderId: "0xnew", status: "none", createAt: 2 } as never,
    ]);
    const resolveLegOutcome = vi.fn().mockImplementation(
      async (_acc, _result, opts: { fetchVenueOrders?: () => Promise<unknown[]> }) => {
        const orders = await opts.fetchVenueOrders?.() ?? [];
        return { orders, settlement: "filled" as const };
      },
    );
    getProvider.mockReturnValue({ resolveLegOutcome });

    const out = await resolveVenueLegOutcome(
      { provider: "Polymarket" } as never,
      Object.assign(new BetResult("Polymarket", true), { orderId: "0xnew" }),
      fetchVenueOrders,
      { confirmPmPost: true },
    );

    expect(fetchVenueOrders).toHaveBeenCalledTimes(1);
    expect(out.settlement).toBe("filled");
    expect(out.orders[0]?.orderId).toBe("0xnew");
  });

  it("falls back to orders[0] when provider has no resolveLegOutcome", async () => {
    getProvider.mockReturnValue({ getOrders: vi.fn() });
    const fetchVenueOrders = vi.fn().mockResolvedValue([
      { orderId: "1", status: "reject", createAt: 1, odds: 2, betMoney: 10 } as never,
    ]);

    const out = await resolveVenueLegOutcome(
      { provider: "HG" } as never,
      new BetResult("HG", true),
      fetchVenueOrders,
    );

    expect(out.settlement).toBe("unfilled");
  });
});
