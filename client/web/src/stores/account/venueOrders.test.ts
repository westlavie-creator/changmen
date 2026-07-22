import type { VenueOrder } from "@changmen/venue-adapter/contract";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlatformAccount } from "@/models/platformAccount";
import { applyUnsettledStats, syncVenueOrders } from "@/stores/account/venueOrders";

const saveOrders = vi.hoisted(() => vi.fn(async () => undefined));
const getOrders = vi.hoisted(() => vi.fn(async () => [] as VenueOrder[]));

vi.mock("@/api/order", () => ({
  saveOrders,
}));

vi.mock("@/runtime/providers", () => ({
  getProvider: () => ({ getOrders }),
}));

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

  it("excludes PF sold buys and sell rows from unsettle", () => {
    const acc = makeAccount(500);
    applyUnsettledStats(acc, [
      {
        ...makeVenueOrder({ orderId: "b1", status: "none", odds: 2, betMoney: 100 }),
        provider: "PredictFun",
        pfSide: "buy",
        pfSellState: "closed",
      },
      {
        ...makeVenueOrder({ orderId: "s1", status: "none", odds: 1.8, betMoney: 115 }),
        provider: "PredictFun",
        pfSide: "sell",
        pfBuyOrderId: "b1",
        pfSellState: "closed",
      },
      {
        ...makeVenueOrder({ orderId: "b2", status: "none", odds: 2, betMoney: 50 }),
        provider: "PredictFun",
        pfSide: "buy",
        pfSellState: "open",
        // 回款敞口 = 截断持仓×汇率；约等于旧 odds×betMoney=100
        pfHoldShares: 100 / 6.8,
        pfBookPrice: 0.5,
      },
    ]);
    expect(acc.unsettle).toBe(1);
    // 截断后持仓×汇率：trunc(100/6.8,2)*6.8
    expect(acc.winBalance).toBeCloseTo(500 + Math.trunc((100 / 6.8) * 100 + 1e-9) / 100 * 6.8, 8);
  });
});

describe("syncVenueOrders PredictFun", () => {
  beforeEach(() => {
    saveOrders.mockClear();
    getOrders.mockReset();
    getOrders.mockResolvedValue([
      {
        ...makeVenueOrder({ orderId: "pf1", status: "none", odds: 2, betMoney: 10 }),
        provider: "PredictFun",
        pfSide: "buy",
        pfSellState: "open",
        pfHoldShares: 20,
      },
    ]);
  });

  it("updates local stats but does not Client_SaveOrder", async () => {
    const acc = new PlatformAccount({
      accountId: 42,
      playerName: "pf-user",
      provider: "PredictFun",
    });
    acc.balance = 100;

    const orders = await syncVenueOrders(acc);
    expect(orders?.length).toBe(1);
    expect(acc.unsettle).toBe(1);
    expect(saveOrders).not.toHaveBeenCalled();
  });
});
