import { describe, expect, it } from "vitest";
import {
  evaluatePfBuyForSell,
  isPfPositionTerminalForUser,
  isPfSellBlockedForSettle,
  isPfSellClosing,
  readPfLedgerState,
  toUserPfSellState,
} from "./pf_lifecycle.js";

describe("pf_lifecycle", () => {
  it("folds closing → open for users", () => {
    expect(toUserPfSellState({ pfSellState: "closing" })).toBe("open");
    expect(toUserPfSellState({ PfSellState: "OPEN" })).toBe("open");
    expect(toUserPfSellState({ pfSellState: "closed" })).toBe("closed");
    expect(toUserPfSellState({ pfSellState: "settled" })).toBe("settled");
    expect(toUserPfSellState({})).toBeUndefined();
  });

  it("keeps closing as internal settle/sell guard", () => {
    expect(isPfSellClosing({ pfSellState: "closing" })).toBe(true);
    expect(isPfSellBlockedForSettle({ pfSellState: "closing" })).toBe(true);
    expect(isPfSellBlockedForSettle({ pfSellState: "open" })).toBe(false);
    expect(isPfPositionTerminalForUser({ pfSellState: "closing" })).toBe(false);
    expect(isPfPositionTerminalForUser({ pfSellState: "closed" })).toBe(true);
  });

  it("evaluatePfBuyForSell covers resume paths", () => {
    expect(evaluatePfBuyForSell(null).ok).toBe(false);
    expect(evaluatePfBuyForSell({
      pfSellState: "closed",
      pfLedgerState: "pending_credit",
    })).toEqual({ ok: true, action: "resume_credit" });
    expect(evaluatePfBuyForSell({
      pfSellState: "closing",
      pfSellOrderId: "0xsell",
    })).toEqual({ ok: true, action: "resume_closing", sellHash: "0xsell" });
    expect(evaluatePfBuyForSell({
      status: "none",
      pfSellState: "open",
      pfMarketId: "m1",
      pfTokenId: "t1",
      pfHoldShares: 12,
    })).toEqual({
      ok: true,
      action: "sell",
      marketId: "m1",
      tokenId: "t1",
      holdShares: 12,
    });
    expect(readPfLedgerState({ pfLedgerState: "pending_credit" })).toBe("pending_credit");
  });
});
