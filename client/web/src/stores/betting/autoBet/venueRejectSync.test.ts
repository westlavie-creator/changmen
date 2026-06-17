import { beforeEach, describe, expect, it, vi } from "vitest";
import { BetResult } from "@/models/betResult";
import type { PlatformAccount } from "@/models/platformAccount";
import type { VenueOrder } from "@platform/contract";

const updateVenueOrders = vi.fn<() => Promise<VenueOrder[] | undefined>>();

vi.mock("@/shared/wait", () => ({
  wait: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/shared/a8Notify", () => ({
  a8Tip: vi.fn(),
}));

import { wait } from "@/shared/wait";

vi.mock("@/stores/accountStore", () => ({
  useAccountStore: () => ({ updateVenueOrders }),
}));

import {
  fetchVenueOrdersWithReject,
  pollVenueRejectFlags,
  syncVenueRejectFlags,
} from "./venueRejectSync";

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
  });

  it("marks rejected when first order status is reject", async () => {
    updateVenueOrders.mockResolvedValue([
      makeVenueOrder({ orderId: "1", status: "reject", odds: 1.5, betMoney: 100 }),
      makeVenueOrder({ orderId: "2", status: "none", odds: 1.5, betMoney: 100 }),
    ]);

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

describe("pollVenueRejectFlags", () => {
  beforeEach(() => {
    updateVenueOrders.mockReset();
    vi.mocked(wait).mockClear();
  });

  it("pollSec<=0 时只拉单一次、不 wait", async () => {
    updateVenueOrders.mockResolvedValue([
      makeVenueOrder({ orderId: "1", status: "none", odds: 1.5, betMoney: 100 }),
    ]);

    await pollVenueRejectFlags(
      new BetResult("OB", true),
      account("OB"),
      undefined,
      undefined,
      10,
      0,
    );

    expect(wait).not.toHaveBeenCalled();
    expect(updateVenueOrders).toHaveBeenCalledTimes(1);
  });

  it("等待期间每秒拉单，检测到拒单后提前结束", async () => {
    const acc = account("RAY");
    updateVenueOrders
      .mockResolvedValueOnce([
        makeVenueOrder({ orderId: "1", status: "none", odds: 1.5, betMoney: 100 }),
      ])
      .mockResolvedValueOnce([
        makeVenueOrder({ orderId: "1", status: "reject", odds: 1.5, betMoney: 100 }),
      ]);

    const out = await pollVenueRejectFlags(
      new BetResult("RAY", true),
      acc,
      undefined,
      undefined,
      10,
      5,
    );

    expect(wait).toHaveBeenCalledTimes(2);
    expect(updateVenueOrders).toHaveBeenCalledTimes(2);
    expect(out.rejectA).toBe(true);
  });
});
