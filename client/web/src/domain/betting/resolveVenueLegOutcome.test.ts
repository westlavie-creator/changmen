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

  it("delegates to provider.resolveLegOutcome with pre-fetched orders", async () => {
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

    expect(resolveLegOutcome).toHaveBeenCalledWith(
      { provider: "Polymarket" },
      expect.any(BetResult),
      expect.objectContaining({ confirmPmPost: true, fetchVenueOrders: expect.any(Function) }),
    );
    expect(out.settlement).toBe("filled");
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
