import type { VenueOrder } from "@venue/contract";
import { describe, expect, it } from "vitest";
import { BetResult } from "@/models/betResult";
import { resolveArbBindOrderId } from "./arbOrderBind";

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

  it("binds orders[0] when list non-empty and no result orderId", () => {
    const orders = [
      makeVenueOrder({ orderId: "bind-1", status: "none", odds: 2, betMoney: 100 }),
    ];
    expect(resolveArbBindOrderId(orders, undefined)).toBe("bind-1");
    expect(resolveArbBindOrderId([], undefined)).toBeUndefined();
  });
});
