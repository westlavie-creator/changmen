import { beforeEach, describe, expect, it, vi } from "vitest";
import { BetResult } from "@changmen/client-core/models/betResult";
import { BetOption } from "@changmen/client-core/models/betOption";
import { Currency, getExchange } from "@changmen/shared/currency";
import { persistPolymarketExecutionReject } from "./pmRejectOrder";

const saveOrders = vi.fn();

vi.mock("@/api/order", () => ({
  saveOrders: (...args: unknown[]) => saveOrders(...args),
}));

describe("persistPolymarketExecutionReject", () => {
  beforeEach(() => {
    saveOrders.mockReset();
    saveOrders.mockResolvedValue(undefined);
  });

  it("skips non-Polymarket", async () => {
    const out = await persistPolymarketExecutionReject(
      { provider: "OB", accountId: 1 } as never,
      new BetResult("OB", false, "x"),
      "api_failed",
    );
    expect(out).toBeNull();
    expect(saveOrders).not.toHaveBeenCalled();
  });

  it("skips api_failed when POST was not reached", async () => {
    const out = await persistPolymarketExecutionReject(
      { provider: "Polymarket", accountId: 9 } as never,
      new BetResult("Polymarket", false, "凭证缺少 walletAddress"),
      "api_failed",
    );
    expect(out).toBeNull();
    expect(saveOrders).not.toHaveBeenCalled();
  });

  it("saves synthetic reject for posted api_failed without orderId", async () => {
    const account = { provider: "Polymarket", accountId: 9 } as never;
    const result = Object.assign(new BetResult("Polymarket", false, "fail"), {
      beginTime: 1_700_000_000_000,
      tip: { pmPosted: true },
    });
    const option = new BetOption("Polymarket", "m1", "b1", "i1", 10, "Home", 1.55);
    const out = await persistPolymarketExecutionReject(account, result, "api_failed", {
      betOption: option,
      linkId: 55,
    });
    expect(out?.status).toBe("reject");
    expect(out?.orderId).toBe("pm-rej-9-1700000000000-api_failed");
    expect(out?.pmStakeUsdc).toBe(10);
    expect(out?.betMoney).toBeCloseTo(10 * getExchange(Currency.USDT), 4);
    expect(out?.link).toBe(55);
    expect(out?.pmRejectReason).toBe("api_failed");
    expect(saveOrders).toHaveBeenCalledTimes(1);
    expect(saveOrders.mock.calls[0][0]).toBe(account);
    expect(saveOrders.mock.calls[0][1][0].orderId).toBe(out!.orderId);
    expect(saveOrders.mock.calls[0][1][0].betMoney).toBeCloseTo(10 * getExchange(Currency.USDT), 4);
    expect(saveOrders.mock.calls[0][1][0].pmStakeUsdc).toBe(10);
  });

  it("saves unfilled with official orderId without requiring pmPosted", async () => {
    const account = { provider: "Polymarket", accountId: 3 } as never;
    const result = Object.assign(new BetResult("Polymarket", true), {
      orderId: "0xdead",
      beginTime: 100,
    });
    const out = await persistPolymarketExecutionReject(account, result, "unfilled");
    expect(out?.orderId).toBe("0xdead");
    expect(out?.pmRejectReason).toBe("unfilled");
    expect(saveOrders).toHaveBeenCalledTimes(1);
  });

  it("uses response.orderID for posted api_failed", async () => {
    const account = { provider: "Polymarket", accountId: 3 } as never;
    const result = Object.assign(new BetResult("Polymarket", false, "unmatched"), {
      tip: { pmPosted: true },
      response: { orderID: "0xclob" },
      beginTime: 100,
    });
    const out = await persistPolymarketExecutionReject(account, result, "api_failed", {
      linkId: 1_700_000_000_001,
    });
    expect(out?.orderId).toBe("0xclob");
    expect(out?.link).toBe(1_700_000_000_001);
  });
});
