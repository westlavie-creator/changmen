import { beforeEach, describe, expect, it, vi } from "vitest";
import { BetResult } from "@/models/betResult";
import type { PlatformAccount } from "@/models/platformAccount";
import type { VenueOrder } from "@platform/contract";

const updateVenueOrders = vi.fn<() => Promise<VenueOrder[] | undefined>>();

vi.mock("@/stores/accountStore", () => ({
  useAccountStore: () => ({ updateVenueOrders }),
}));

import {
  fetchVenueOrdersWithReject,
  syncVenueRejectFlags,
} from "./venueRejectSync";

function account(provider: string): PlatformAccount {
  return { provider } as PlatformAccount;
}

function venueOrder(status: VenueOrder["status"]): VenueOrder {
  return { orderId: "1", status, money: 100, odds: 1.5 };
}

describe("fetchVenueOrdersWithReject", () => {
  beforeEach(() => {
    updateVenueOrders.mockReset();
  });

  it("marks rejected when first order status is reject", async () => {
    updateVenueOrders.mockResolvedValue([
      venueOrder("reject"),
      venueOrder("accepted"),
    ]);

    const out = await fetchVenueOrdersWithReject(account("OB"));

    expect(out.orders).toHaveLength(2);
    expect(out.rejected).toBe(true);
  });

  it("not rejected when list empty or first order accepted", async () => {
    updateVenueOrders.mockResolvedValue([]);
    expect((await fetchVenueOrdersWithReject(account("OB"))).rejected).toBe(false);

    updateVenueOrders.mockResolvedValue([venueOrder("accepted")]);
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
      .mockResolvedValueOnce([venueOrder("reject")])
      .mockResolvedValueOnce([venueOrder("accepted")]);

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
      .mockResolvedValueOnce([venueOrder("accepted")])
      .mockResolvedValueOnce([venueOrder("reject")]);

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
