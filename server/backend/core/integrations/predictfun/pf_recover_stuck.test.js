import { describe, expect, it, vi } from "vitest";

vi.mock("./pf_player_account.js", () => ({
  loadPfOrders: vi.fn(async () => []),
  retryPendingPfLedgerCredits: vi.fn(async () => ({ creditedCount: 0, creditedUsdt: 0 })),
}));

vi.mock("./pf_exec_sell.js", () => ({
  executePfSellInLock: vi.fn(async () => ({ sellOrderId: "0xsell", proceedsUsdt: 1 })),
}));

vi.mock("./pf_order_service.js", () => ({
  withHouseOrderLock: vi.fn(async (fn) => fn()),
}));

describe("pf_recover_stuck", () => {
  it("lists pending_credit and closing without executing", async () => {
    const { loadPfOrders } = await import("./pf_player_account.js");
    loadPfOrders.mockResolvedValueOnce([
      {
        orderId: "0xbuy",
        pfLedgerState: "pending_credit",
        pfPendingCreditUsdt: 3.5,
        pfSellState: "closed",
        status: "none",
      },
      {
        orderId: "0xclosing",
        pfSellState: "closing",
        pfSellOrderId: "0xsell",
        pfHoldShares: 10,
        status: "none",
      },
    ]);
    const { listPfStuckOrdersForPlayer } = await import("./pf_recover_stuck.js");
    const out = await listPfStuckOrdersForPlayer(1, "u1");
    expect(out.pendingCredit).toHaveLength(1);
    expect(out.pendingCredit[0].orderId).toBe("0xbuy");
    expect(out.closing).toHaveLength(1);
    expect(out.closing[0].pfSellOrderId).toBe("0xsell");
  });

  it("recovers closing via executePfSellInLock", async () => {
    const { loadPfOrders, retryPendingPfLedgerCredits } = await import("./pf_player_account.js");
    const { executePfSellInLock } = await import("./pf_exec_sell.js");
    loadPfOrders.mockResolvedValueOnce([
      {
        orderId: "0xclosing",
        OrderID: "0xclosing",
        pfSellState: "closing",
        pfSellOrderId: "0xsell",
        status: "none",
      },
    ]);
    retryPendingPfLedgerCredits.mockResolvedValueOnce({ creditedCount: 1, creditedUsdt: 2 });
    const { recoverPfStuckOrdersForPlayer } = await import("./pf_recover_stuck.js");
    const out = await recoverPfStuckOrdersForPlayer(1, "u1");
    expect(out.pendingCredit.creditedCount).toBe(1);
    expect(out.closing).toEqual([
      expect.objectContaining({ buyOrderId: "0xclosing", ok: true }),
    ]);
    expect(executePfSellInLock).toHaveBeenCalledWith({
      playerId: 1,
      userId: "u1",
      buyOrderId: "0xclosing",
    });
  });
});
