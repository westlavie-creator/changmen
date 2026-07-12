import { beforeEach, describe, expect, it, vi } from "vitest";
import { BetOption } from "@changmen/client-core/models/betOption";
import { BetResult } from "@changmen/client-core/models/betResult";
import { markArbSuccessLegs } from "./finalizeArbMarkers";

const markSuccessfulBet = vi.hoisted(() => vi.fn());

vi.mock("@/stores/betting/successMarkers", () => ({
  markSuccessfulBet,
}));

describe("markArbSuccessLegs", () => {
  beforeEach(() => {
    markSuccessfulBet.mockReset();
  });

  it("marks both success legs without pendingConfirm gate (A8 parity)", () => {
    const legA = new BetOption("OB" as never, "m1", "b1", "h1", 70, "Home", 2);
    const legB = new BetOption("Polymarket" as never, "m2", "b2", "a1", 26, "Away", 1.72);
    markArbSuccessLegs(
      { id: 100 } as never,
      {
        legA,
        legB,
        accountA: { accountId: 1 } as never,
        accountB: { accountId: 2 } as never,
        resultA: new BetResult("OB", true),
        resultB: Object.assign(new BetResult("Polymarket", true), {
          orderId: "0xpm",
          reject: "timeout",
        }),
      } as never,
      {
        rejectA: false,
        rejectB: false,
        pendingConfirmA: false,
        pendingConfirmB: true,
      } as never,
    );

    expect(markSuccessfulBet).toHaveBeenCalledTimes(2);
    expect(markSuccessfulBet).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 1 }),
      100,
      "Home",
      2,
    );
    expect(markSuccessfulBet).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 2 }),
      100,
      "Away",
      1.72,
    );
  });

  it("skips confirmed unfilled legs", () => {
    const legA = new BetOption("RAY" as never, "m1", "b1", "h1", 40, "Home", 1.5);
    const legB = new BetOption("OB" as never, "m2", "b2", "a1", 70, "Away", 2);
    markArbSuccessLegs(
      { id: 50 } as never,
      {
        legA,
        legB,
        accountA: { accountId: 1 } as never,
        accountB: { accountId: 2 } as never,
        resultA: new BetResult("RAY", true),
        resultB: new BetResult("OB", true),
      } as never,
      {
        rejectA: true,
        rejectB: false,
        pendingConfirmA: false,
        pendingConfirmB: false,
      } as never,
    );

    expect(markSuccessfulBet).toHaveBeenCalledTimes(1);
    expect(markSuccessfulBet).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 2 }),
      50,
      "Away",
      2,
    );
  });
});
