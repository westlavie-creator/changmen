import type { VenueOrder } from "@venue/contract";
import { describe, expect, it } from "vitest";
import {
  isVenueOrderIdRejected,
  isVenueReject,
  resolveA8VenueBindOrderId,
  resolveA8VenueReject,
  resolveVenueRejectForLeg,
} from "@/domain/betting/venueReject";

function order(
  partial: Pick<VenueOrder, "orderId" | "status"> & { createAt?: number },
): VenueOrder {
  return {
    provider: "OB",
    createAt: partial.createAt ?? 0,
    odds: 2,
    betMoney: 100,
    reward: 0,
    money: 0,
    game: "",
    match: "",
    bet: "",
    item: "",
    ...partial,
  };
}

describe("isVenueOrderIdRejected", () => {
  it("falls back to orders[0] when orderId missing", () => {
    const orders = [order({ orderId: "old", status: "reject", createAt: 2 })];
    expect(isVenueOrderIdRejected(orders, "")).toBe(true);
    expect(isVenueOrderIdRejected(orders, undefined)).toBe(true);
  });

  it("does not inherit orders[0] reject when our order is non-reject", () => {
    const orders = [
      order({ orderId: "old-reject", status: "reject", createAt: 2000 }),
      order({ orderId: "new-ok", status: "none", createAt: 1000 }),
    ];
    expect(isVenueOrderIdRejected(orders, "new-ok")).toBe(false);
  });

  it("rejects when our orderId is reject in list", () => {
    const orders = [
      order({ orderId: "other", status: "none", createAt: 2000 }),
      order({ orderId: "ours", status: "reject", createAt: 1000 }),
    ];
    expect(isVenueOrderIdRejected(orders, "ours")).toBe(true);
  });

  it("not rejected when our orderId not in list yet", () => {
    const orders = [order({ orderId: "old-reject", status: "reject", createAt: 2 })];
    expect(isVenueOrderIdRejected(orders, "pending-sync")).toBe(false);
  });
});

describe("resolveA8VenueReject", () => {
  it("matches isVenueReject on orders[0]", () => {
    const orders = [order({ orderId: "1", status: "reject" })];
    expect(resolveA8VenueReject(orders)).toBe(true);
    expect(resolveA8VenueReject([])).toBe(false);
  });
});

describe("resolveA8VenueBindOrderId", () => {
  it("returns orders[0].orderId when list non-empty", () => {
    const orders = [order({ orderId: "bind-1", status: "none" })];
    expect(resolveA8VenueBindOrderId(orders)).toBe("bind-1");
    expect(resolveA8VenueBindOrderId([])).toBeUndefined();
  });
});

describe("resolveVenueRejectForLeg", () => {
  it("uses orderId when leg succeeded", () => {
    const orders = [
      order({ orderId: "stale", status: "reject", createAt: 2 }),
      order({ orderId: "live", status: "none", createAt: 1 }),
    ];
    expect(resolveVenueRejectForLeg(orders, { success: true, orderId: "live" })).toBe(false);
  });

  it("falls back to isVenueReject when no orderId on success leg", () => {
    const orders = [order({ orderId: "1", status: "reject" })];
    expect(resolveVenueRejectForLeg(orders, { success: true })).toBe(true);
    expect(isVenueReject(orders)).toBe(true);
  });
});
