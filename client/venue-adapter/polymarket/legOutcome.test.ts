import type { VenueOrder } from "@changmen/venue-adapter/contract";
import type { PlatformAccount } from "@changmen/client-core/models/platformAccount";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BetResult } from "@changmen/client-core/models/betResult";
import { resolvePolymarketLegOutcome } from "./legOutcome";

const settlePolymarketDelayedOrder = vi.fn();
const awaitPolymarketSettlementJob = vi.fn();
const fetchPolymarketConfirmedTradeForOrder = vi.fn();

vi.mock("./orderSettlement", () => ({
  settlePolymarketDelayedOrder: (...args: unknown[]) => settlePolymarketDelayedOrder(...args),
}));

vi.mock("./settlementJob", () => ({
  awaitPolymarketSettlementJob: (...args: unknown[]) => awaitPolymarketSettlementJob(...args),
}));

vi.mock("./orders", () => ({
  fetchPolymarketConfirmedTradeForOrder: (...args: unknown[]) =>
    fetchPolymarketConfirmedTradeForOrder(...args),
}));

function account(): PlatformAccount {
  return { provider: "Polymarket", accountId: 9 } as PlatformAccount;
}

function makeVenueOrder(
  partial: Pick<VenueOrder, "orderId" | "status" | "odds" | "betMoney">,
): VenueOrder {
  return {
    provider: "Polymarket",
    createAt: 0,
    reward: 0,
    money: 0,
    game: "",
    match: "",
    bet: "",
    item: "",
    ...partial,
  };
}

describe("resolvePolymarketLegOutcome", () => {
  const fetchVenueOrders = vi.fn<() => Promise<VenueOrder[]>>();

  beforeEach(() => {
    settlePolymarketDelayedOrder.mockReset();
    awaitPolymarketSettlementJob.mockReset();
    awaitPolymarketSettlementJob.mockResolvedValue(null);
    fetchPolymarketConfirmedTradeForOrder.mockReset();
    fetchVenueOrders.mockReset();
    fetchVenueOrders.mockResolvedValue([]);
  });

  it("prefers POST SettlementJob over settle when job exists", async () => {
    const result = Object.assign(new BetResult("Polymarket", true), {
      pending: true,
      orderId: "0xjob",
    });
    awaitPolymarketSettlementJob.mockResolvedValue({
      outcome: "matched",
      row: { status: "MATCHED", size_matched: "10" },
    });
    fetchVenueOrders.mockResolvedValue([
      makeVenueOrder({ orderId: "0xjob", status: "none", odds: 2, betMoney: 14 }),
    ]);

    const out = await resolvePolymarketLegOutcome(account(), result, { fetchVenueOrders });

    expect(awaitPolymarketSettlementJob).toHaveBeenCalledWith(account(), "0xjob");
    expect(settlePolymarketDelayedOrder).not.toHaveBeenCalled();
    expect(out.settlement).toBe("filled");
    expect(out.orders[0]?.orderId).toBe("0xjob");
  });

  it("delayed pending unfilled → settlement unfilled", async () => {
    const result = Object.assign(new BetResult("Polymarket", true), {
      pending: true,
      orderId: "0xdelayed",
    });
    settlePolymarketDelayedOrder.mockResolvedValue({ outcome: "unfilled", row: null });

    const out = await resolvePolymarketLegOutcome(account(), result, { fetchVenueOrders });

    expect(out.settlement).toBe("unfilled");
    expect(out.orders[0]?.status).toBe("reject");
    expect(result.pending).toBe(false);
    expect(fetchVenueOrders).not.toHaveBeenCalled();
  });

  it("honors result.reject without polling venue list", async () => {
    const result = Object.assign(new BetResult("Polymarket", true), {
      orderId: "0xsettled-unfilled",
      reject: "unfilled",
    });

    const out = await resolvePolymarketLegOutcome(account(), result, { fetchVenueOrders });

    expect(settlePolymarketDelayedOrder).not.toHaveBeenCalled();
    expect(fetchPolymarketConfirmedTradeForOrder).not.toHaveBeenCalled();
    expect(fetchVenueOrders).not.toHaveBeenCalled();
    expect(out.settlement).toBe("unfilled");
  });

  it("POST matched trusts fill when venue list still shows old reject", async () => {
    const result = Object.assign(
      new BetResult("Polymarket", true, "matched", null, {
        success: true,
        status: "matched",
        orderID: "0xnew",
        takingAmount: "10",
      }),
      { orderId: "0xnew" },
    );
    fetchVenueOrders.mockResolvedValue([
      makeVenueOrder({ orderId: "0xold", status: "reject", odds: 2, betMoney: 10 }),
    ]);

    const out = await resolvePolymarketLegOutcome(account(), result, { fetchVenueOrders });

    expect(out.settlement).toBe("filled");
    expect(settlePolymarketDelayedOrder).not.toHaveBeenCalled();
    expect(fetchPolymarketConfirmedTradeForOrder).not.toHaveBeenCalled();
    expect(fetchVenueOrders).toHaveBeenCalledTimes(1);
  });

  it("polls settlement when trade missing and order not in venue list", async () => {
    const result = Object.assign(new BetResult("Polymarket", true), {
      orderId: "0xmissing",
      response: { success: true, status: "live", orderID: "0xmissing" },
    });
    fetchPolymarketConfirmedTradeForOrder.mockResolvedValueOnce(null);
    settlePolymarketDelayedOrder.mockResolvedValue({ outcome: "unfilled", row: null });

    const out = await resolvePolymarketLegOutcome(account(), result, { fetchVenueOrders });

    expect(settlePolymarketDelayedOrder).toHaveBeenCalledWith(account(), "0xmissing");
    expect(out.settlement).toBe("unfilled");
    expect(result.reject).toBe("unfilled");
  });
});
