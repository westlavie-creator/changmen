import type { VenueOrder } from "@venue/contract";
import type { PlatformAccount } from "@/models/platformAccount";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BetResult } from "@/models/betResult";

import {
  fetchVenueOrdersWithReject,
  syncVenueOrdersWithRejectForLeg,
  syncVenueRejectFlags,
} from "./venueRejectSync";

const updateVenueOrders = vi.fn<() => Promise<VenueOrder[] | undefined>>();
const settlePolymarketDelayedOrder = vi.fn();
const fetchPolymarketConfirmedTradeForOrder = vi.fn();

vi.mock("@/stores/accountStore", () => ({
  useAccountStore: () => ({ updateVenueOrders }),
}));

vi.mock("@venue/polymarket/orderStatus", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@venue/polymarket/orderStatus")>();
  return {
    ...actual,
    settlePolymarketDelayedOrder: (...args: unknown[]) => settlePolymarketDelayedOrder(...args),
  };
});

vi.mock("@venue/polymarket/orders", () => ({
  fetchPolymarketConfirmedTradeForOrder: (...args: unknown[]) =>
    fetchPolymarketConfirmedTradeForOrder(...args),
}));

function account(provider: string): PlatformAccount {
  return { provider } as PlatformAccount;
}

function makeVenueOrder(
  partial: Pick<VenueOrder, "orderId" | "status" | "odds" | "betMoney">,
): VenueOrder {
  return {
    provider: "RAY",
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

describe("fetchVenueOrdersWithReject", () => {
  beforeEach(() => {
    updateVenueOrders.mockReset();
    settlePolymarketDelayedOrder.mockReset();
    fetchPolymarketConfirmedTradeForOrder.mockReset();
  });

  it("marks rejected when first order status is reject", async () => {
    updateVenueOrders.mockResolvedValue([
      makeVenueOrder({ orderId: "1", status: "reject", odds: 1.5, betMoney: 100 }),
      makeVenueOrder({ orderId: "2", status: "none", odds: 1.5, betMoney: 100 }),
    ].map((o, i) => ({ ...o, createAt: i === 0 ? 2000 : 1000 })));

    const out = await fetchVenueOrdersWithReject(account("OB"));

    expect(out.orders).toHaveLength(2);
    expect(out.rejected).toBe(true);
  });

  it("not rejected when list empty or first order not reject", async () => {
    updateVenueOrders.mockResolvedValue([]);
    expect((await fetchVenueOrdersWithReject(account("OB"))).rejected).toBe(false);

    updateVenueOrders.mockResolvedValue([
      makeVenueOrder({ orderId: "1", status: "none", odds: 1.5, betMoney: 100 }),
    ]);
    expect((await fetchVenueOrdersWithReject(account("RAY"))).rejected).toBe(false);
  });
});

describe("syncVenueRejectFlags", () => {
  beforeEach(() => {
    updateVenueOrders.mockReset();
    settlePolymarketDelayedOrder.mockReset();
    fetchPolymarketConfirmedTradeForOrder.mockReset();
  });

  it("syncs only successful legs", async () => {
    const accA = account("OB");
    const accB = account("RAY");
    updateVenueOrders
      .mockResolvedValueOnce([
        makeVenueOrder({ orderId: "1", status: "reject", odds: 1.5, betMoney: 100 }),
      ])
      .mockResolvedValueOnce([
        makeVenueOrder({ orderId: "2", status: "none", odds: 1.5, betMoney: 100 }),
      ]);

    const out = await syncVenueRejectFlags(
      new BetResult("OB", true),
      accA,
      new BetResult("RAY", false),
      accB,
    );

    expect(updateVenueOrders).toHaveBeenCalledTimes(1);
    expect(updateVenueOrders).toHaveBeenCalledWith(accA);
    expect(out.ordersA).toHaveLength(1);
    expect(out.rejectA).toBe(true);
    expect(out.ordersB).toEqual([]);
    expect(out.rejectB).toBe(false);
  });

  it("syncs both legs when both succeeded", async () => {
    const accA = account("OB");
    const accB = account("IA");
    updateVenueOrders
      .mockResolvedValueOnce([
        makeVenueOrder({ orderId: "1", status: "none", odds: 1.5, betMoney: 100 }),
      ])
      .mockResolvedValueOnce([
        makeVenueOrder({ orderId: "2", status: "reject", odds: 1.5, betMoney: 100 }),
      ]);

    const out = await syncVenueRejectFlags(
      new BetResult("OB", true),
      accA,
      new BetResult("IA", true),
      accB,
    );

    expect(updateVenueOrders).toHaveBeenCalledTimes(2);
    expect(out.rejectA).toBe(false);
    expect(out.rejectB).toBe(true);
  });
});

describe("syncVenueOrdersWithRejectForLeg (Polymarket)", () => {
  beforeEach(() => {
    updateVenueOrders.mockReset();
    settlePolymarketDelayedOrder.mockReset();
    fetchPolymarketConfirmedTradeForOrder.mockReset();
  });

  it("delayed pending unfilled → synthetic reject", async () => {
    const acc = account("Polymarket");
    const result = Object.assign(new BetResult("Polymarket", true), {
      pending: true,
      orderId: "0xdelayed",
    });
    settlePolymarketDelayedOrder.mockResolvedValue({ outcome: "unfilled", row: null });

    const out = await syncVenueOrdersWithRejectForLeg(acc, result);

    expect(settlePolymarketDelayedOrder).toHaveBeenCalledWith(acc, "0xdelayed");
    expect(out.rejected).toBe(true);
    expect(out.orders[0]?.status).toBe("reject");
    expect(out.orders[0]?.orderId).toBe("0xdelayed");
    expect(result.pending).toBe(false);
    expect(updateVenueOrders).not.toHaveBeenCalled();
  });

  it("delayed pending matched → refresh venue orders", async () => {
    const acc = account("Polymarket");
    const result = Object.assign(new BetResult("Polymarket", true), {
      pending: true,
      orderId: "0xmatched",
    });
    settlePolymarketDelayedOrder.mockResolvedValue({
      outcome: "matched",
      row: { status: "MATCHED", size_matched: "10" },
    });
    updateVenueOrders.mockResolvedValue([
      makeVenueOrder({ orderId: "0xmatched", status: "none", odds: 2, betMoney: 14 }),
    ]);

    const out = await syncVenueOrdersWithRejectForLeg(acc, result);

    expect(updateVenueOrders).toHaveBeenCalledWith(acc);
    expect(out.rejected).toBe(false);
    expect(result.pending).toBe(false);
    expect(result.message).toContain("已成交");
  });

  it("POST matched trusts fill when venue list still shows old reject", async () => {
    const acc = account("Polymarket");
    const result = Object.assign(
      new BetResult("Polymarket", true, "matched", null, {
        success: true,
        status: "matched",
        orderID: "0xnew",
        takingAmount: "10",
      }),
      { orderId: "0xnew" },
    );
    updateVenueOrders.mockResolvedValue([
      makeVenueOrder({ orderId: "0xold", status: "reject", odds: 2, betMoney: 10 }),
    ]);

    const out = await syncVenueOrdersWithRejectForLeg(acc, result);

    expect(settlePolymarketDelayedOrder).not.toHaveBeenCalled();
    expect(updateVenueOrders).toHaveBeenCalledWith(acc);
    expect(out.rejected).toBe(false);
    expect(out.orders.length).toBeGreaterThan(0);
  });

  it("uncertain fill polls trade before rejecting on stale list", async () => {
    const acc = account("Polymarket");
    const result = Object.assign(new BetResult("Polymarket", true), {
      orderId: "0xuncertain",
      response: { success: true, status: "live", orderID: "0xuncertain" },
    });
    fetchPolymarketConfirmedTradeForOrder.mockResolvedValueOnce({
      id: "trade-1",
      taker_order_id: "0xuncertain",
      status: "CONFIRMED",
    });
    updateVenueOrders.mockResolvedValue([
      makeVenueOrder({ orderId: "0xold", status: "reject", odds: 2, betMoney: 10 }),
    ]);

    const out = await syncVenueOrdersWithRejectForLeg(acc, result);

    expect(fetchPolymarketConfirmedTradeForOrder).toHaveBeenCalled();
    expect(out.rejected).toBe(false);
  });
});
