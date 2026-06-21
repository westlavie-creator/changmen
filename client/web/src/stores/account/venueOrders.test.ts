import type { VenueOrder } from "@platform/contract";
import { describe, expect, it } from "vitest";
import { PlatformAccount } from "@/models/platformAccount";
import { applyUnsettledStats } from "@/stores/account/venueOrders";

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

function makeAccount(balance?: number) {
  const acc = new PlatformAccount({
    accountId: 1,
    playerName: "test",
    provider: "RAY",
  });
  acc.balance = balance;
  return acc;
}

describe("applyUnsettledStats", () => {
  it("counts unsettled orders and adds exposure to winBalance", () => {
    const acc = makeAccount(500);
    const orders: VenueOrder[] = [
      makeVenueOrder({ orderId: "1", status: "none", odds: 2, betMoney: 100 }),
      makeVenueOrder({ orderId: "2", status: "none", odds: 1.5, betMoney: 200 }),
      makeVenueOrder({ orderId: "3", status: "win", odds: 2, betMoney: 50 }),
    ];
    applyUnsettledStats(acc, orders);
    expect(acc.unsettle).toBe(2);
    expect(acc.winBalance).toBe(500 + 2 * 100 + 1.5 * 200);
  });

  it("treats missing balance as zero for winBalance", () => {
    const acc = makeAccount(undefined);
    applyUnsettledStats(acc, [
      makeVenueOrder({ orderId: "1", status: "none", odds: 2, betMoney: 50 }),
    ]);
    expect(acc.unsettle).toBe(1);
    expect(acc.winBalance).toBe(100);
  });

  it("clears unsettle stats when venue returns no open orders", () => {
    const acc = makeAccount(500);
    acc.unsettle = 3;
    acc.winBalance = 999;
    applyUnsettledStats(acc, []);
    expect(acc.unsettle).toBe(0);
    expect(acc.winBalance).toBe(500);
  });
});
