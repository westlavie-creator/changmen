import type { VenueOrder } from "@venue/contract";
import type { PlatformAccount } from "@/models/platformAccount";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BetResult } from "@/models/betResult";

import {
  fetchVenueOrdersWithReject,
  resolveArbBindOrderId,
  syncVenueOrdersWithRejectForLeg,
  syncVenueRejectFlags,
} from "./venueRejectSync";

const updateVenueOrders = vi.fn<() => Promise<VenueOrder[] | undefined>>();
const settlePolymarketDelayedOrder = vi.fn();
const awaitPolymarketSettlementJob = vi.fn();
const fetchPolymarketConfirmedTradeForOrder = vi.fn();

vi.mock("@/stores/accountStore", () => ({
  useAccountStore: () => ({ updateVenueOrders }),
}));

vi.mock("@venue/polymarket/orderSettlement", () => ({
  settlePolymarketDelayedOrder: (...args: unknown[]) => settlePolymarketDelayedOrder(...args),
}));

vi.mock("@venue/polymarket/settlementJob", () => ({
  awaitPolymarketSettlementJob: (...args: unknown[]) => awaitPolymarketSettlementJob(...args),
}));

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

describe("resolveArbBindOrderId", () => {
  it("prefers result.orderId for success legs", () => {
    const result = Object.assign(new BetResult("Polymarket", true), {
      orderId: "0xd695a0c4cdd10b558fc829ecda52f20eeca76407",
    });
    const orders = [
      makeVenueOrder({ orderId: "0xfe933cac68e49da172f4ab8e59e6c1", status: "none", odds: 2.6, betMoney: 98 }),
    ];
    expect(resolveArbBindOrderId(orders, result)).toBe("0xd695a0c4cdd10b558fc829ecda52f20eeca76407");
  });

  it("success A8 leg prefers result.orderId over orders[0]", () => {
    const result = Object.assign(new BetResult("OB", true), {
      orderId: "from-result",
    });
    const orders = [
      makeVenueOrder({ orderId: "ob-1", status: "none", odds: 2, betMoney: 100 }),
    ];
    expect(resolveArbBindOrderId(orders, result)).toBe("from-result");
  });

  it("rejected leg binds orders[0] when result orderId missing from list", () => {
    const result = Object.assign(new BetResult("RAY", true), {
      orderId: "missing",
    });
    const orders = [
      makeVenueOrder({ orderId: "ray-reject", status: "reject", odds: 1.76, betMoney: 170 }),
    ];
    expect(resolveArbBindOrderId(orders, result, true)).toBe("ray-reject");
  });
});

describe("fetchVenueOrdersWithReject", () => {
  beforeEach(() => {
    updateVenueOrders.mockReset();
    settlePolymarketDelayedOrder.mockReset();
    awaitPolymarketSettlementJob.mockReset();
    awaitPolymarketSettlementJob.mockResolvedValue(null);
    fetchPolymarketConfirmedTradeForOrder.mockReset();
  });

  it("marks rejected when first order status is reject (no result orderId)", async () => {
    updateVenueOrders.mockResolvedValue([
      makeVenueOrder({ orderId: "1", status: "reject", odds: 1.5, betMoney: 100 }),
      makeVenueOrder({ orderId: "2", status: "none", odds: 1.5, betMoney: 100 }),
    ].map((o, i) => ({ ...o, createAt: i === 0 ? 2000 : 1000 })));

    const out = await fetchVenueOrdersWithReject(account("OB"));

    expect(out.orders).toHaveLength(2);
    expect(out.rejected).toBe(true);
  });

  it("does not inherit orders[0] reject when result.orderId is our success order (PM only)", async () => {
    updateVenueOrders.mockResolvedValue([
      makeVenueOrder({ orderId: "old-reject", status: "reject", odds: 1.5, betMoney: 100 }),
      makeVenueOrder({ orderId: "new-ok", status: "none", odds: 1.5, betMoney: 100 }),
    ].map((o, i) => ({ ...o, createAt: i === 0 ? 2000 : 1000 })));

    const result = Object.assign(new BetResult("Polymarket", true), { orderId: "new-ok" });
    const out = await fetchVenueOrdersWithReject(account("Polymarket"), result);

    expect(out.rejected).toBe(false);
  });

  it("A8 venue: orders[0] reject even when result.orderId points to newer none", async () => {
    updateVenueOrders.mockResolvedValue([
      makeVenueOrder({ orderId: "old-reject", status: "reject", odds: 1.5, betMoney: 100 }),
      makeVenueOrder({ orderId: "new-ok", status: "none", odds: 1.5, betMoney: 100 }),
    ].map((o, i) => ({ ...o, createAt: i === 0 ? 2000 : 1000 })));

    const result = Object.assign(new BetResult("OB", true), { orderId: "new-ok" });
    const out = await fetchVenueOrdersWithReject(account("OB"), result);

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
    awaitPolymarketSettlementJob.mockReset();
    awaitPolymarketSettlementJob.mockResolvedValue(null);
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
      Object.assign(new BetResult("OB", true), { orderId: "1" }),
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

  it("A8 venue leg reject uses orders[0] not result.orderId", async () => {
    const accA = account("OB");
    updateVenueOrders.mockResolvedValueOnce([
      makeVenueOrder({ orderId: "stale-reject", status: "reject", odds: 1.5, betMoney: 100 }),
      makeVenueOrder({ orderId: "new-ok", status: "none", odds: 1.5, betMoney: 100 }),
    ].map((o, i) => ({ ...o, createAt: i === 0 ? 2000 : 1000 })));

    const out = await syncVenueRejectFlags(
      Object.assign(new BetResult("OB", true), { orderId: "new-ok" }),
      accA,
      undefined,
      undefined,
    );

    expect(out.rejectA).toBe(true);
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
    awaitPolymarketSettlementJob.mockReset();
    awaitPolymarketSettlementJob.mockResolvedValue(null);
    fetchPolymarketConfirmedTradeForOrder.mockReset();
  });

  it("prefers POST SettlementJob over settle when job exists", async () => {
    const acc = { provider: "Polymarket", accountId: 9 } as PlatformAccount;
    const result = Object.assign(new BetResult("Polymarket", true), {
      pending: true,
      orderId: "0xjob",
    });
    awaitPolymarketSettlementJob.mockResolvedValue({
      outcome: "matched",
      row: { status: "MATCHED", size_matched: "10" },
    });
    updateVenueOrders.mockResolvedValue([
      makeVenueOrder({ orderId: "0xjob", status: "none", odds: 2, betMoney: 14 }),
    ]);

    const out = await syncVenueOrdersWithRejectForLeg(acc, result);

    expect(awaitPolymarketSettlementJob).toHaveBeenCalledWith(acc, "0xjob");
    expect(settlePolymarketDelayedOrder).not.toHaveBeenCalled();
    expect(out.rejected).toBe(false);
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
    expect(updateVenueOrders).toHaveBeenCalledTimes(1);
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

  it("honors result.reject without polling venue list", async () => {
    const acc = account("Polymarket");
    const result = Object.assign(new BetResult("Polymarket", true), {
      orderId: "0xsettled-unfilled",
      reject: "unfilled",
    });

    const out = await syncVenueOrdersWithRejectForLeg(acc, result);

    expect(settlePolymarketDelayedOrder).not.toHaveBeenCalled();
    expect(fetchPolymarketConfirmedTradeForOrder).not.toHaveBeenCalled();
    expect(updateVenueOrders).toHaveBeenCalledTimes(1);
    expect(out.rejected).toBe(true);
    expect(out.orders[0]?.orderId).toBe("0xsettled-unfilled");
  });

  it("polls settlement when trade missing and order not in venue list", async () => {
    const acc = account("Polymarket");
    const result = Object.assign(new BetResult("Polymarket", true), {
      orderId: "0xmissing",
      response: { success: true, status: "live", orderID: "0xmissing" },
    });
    fetchPolymarketConfirmedTradeForOrder.mockResolvedValueOnce(null);
    settlePolymarketDelayedOrder.mockResolvedValue({ outcome: "unfilled", row: null });

    const out = await syncVenueOrdersWithRejectForLeg(acc, result);

    expect(settlePolymarketDelayedOrder).toHaveBeenCalledWith(acc, "0xmissing");
    expect(out.rejected).toBe(true);
    expect(result.reject).toBe("unfilled");
  });
});
