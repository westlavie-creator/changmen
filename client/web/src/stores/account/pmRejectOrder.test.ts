import { beforeEach, describe, expect, it, vi } from "vitest";
import { BetResult } from "@changmen/client-core/models/betResult";
import { BetOption } from "@changmen/client-core/models/betOption";
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
    option.match = { title: "Alpha vs Beta", game: "LoL" } as never;
    option.bet = { homeName: "Alpha", awayName: "Beta", getBetName: () => "全场" } as never;
    const out = await persistPolymarketExecutionReject(account, result, "api_failed", {
      betOption: option,
      linkId: 55,
    });
    expect(out?.status).toBe("reject");
    expect(out?.orderId).toBe("pm-rej-9-1700000000000-api_failed");
    expect(out?.item).toBe("Alpha");
    expect(out?.betMoney).toBe(10);
    expect(out?.link).toBe(55);
    expect(out?.pmRejectReason).toBe("api_failed");
    expect(saveOrders).toHaveBeenCalledTimes(1);
    expect(saveOrders.mock.calls[0][0]).toBe(account);
    expect(saveOrders.mock.calls[0][1][0].orderId).toBe(out!.orderId);
  });

  it("maps Away to awayName on reject", async () => {
    const account = { provider: "Polymarket", accountId: 3 } as never;
    const result = Object.assign(new BetResult("Polymarket", true), {
      orderId: "0xaway",
      beginTime: 100,
    });
    const option = new BetOption("Polymarket", "m1", "b1", "i1", 5, "Away", 1.8);
    option.match = { title: "HomeTeam vs AwayTeam" } as never;
    option.bet = { homeName: "HomeTeam", awayName: "AwayTeam", getBetName: () => "地图1" } as never;
    const out = await persistPolymarketExecutionReject(account, result, "unfilled", {
      betOption: option,
    });
    expect(out?.item).toBe("AwayTeam");
  });

  it("falls back to match title when bet names missing", async () => {
    const account = { provider: "Polymarket", accountId: 3 } as never;
    const result = Object.assign(new BetResult("Polymarket", true), {
      orderId: "0xmatch",
      beginTime: 100,
    });
    const option = new BetOption("Polymarket", "m1", "b1", "i1", 5, "Away", 1.8);
    option.match = { title: "Left vs Right" } as never;
    const out = await persistPolymarketExecutionReject(account, result, "unfilled", {
      betOption: option,
    });
    expect(out?.item).toBe("Right");
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
