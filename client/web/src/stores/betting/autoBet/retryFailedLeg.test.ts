import { describe, expect, it, vi } from "vitest";
import { BetOption } from "@/models/betOption";
import { BetResult } from "@/models/betResult";
import { PlatformAccount } from "@/models/platformAccount";
import { hedgeStakeCnyFromLeg } from "@/domain/polymarket/pmArbStake";
import { retryFailedLeg } from "@/stores/betting/autoBet/retryFailedLeg";

const getAccount = vi.fn();
const checkBetting = vi.fn();
const betting = vi.fn();

vi.mock("@/stores/accountStore", () => ({
  useAccountStore: () => ({
    getAccount,
    checkBetting,
    betting,
  }),
}));

vi.mock("@/stores/matchStore", () => ({
  useMatchStore: () => ({
    getBetTarget: () => undefined,
  }),
}));

vi.mock("@/stores/betting/successMarkers", () => ({
  readUsedAccounts: () => [],
}));

function makeItem(type: string, odds: number) {
  return {
    type,
    matchId: "m1",
    betId: "b1",
    updateOdds: vi.fn(),
    getOdds: (_side?: string) => odds,
    getItemId: (side: string) => `${type}:${side}`,
  };
}

describe("retryFailedLeg stake (A8 anyOdds + PM CNY)", () => {
  it("uses CNY when success leg is PM after checkBet", () => {
    const pmAccount = new PlatformAccount({
      accountId: 1,
      provider: "Polymarket",
      playerName: "pm",
      currency: "USDT",
    });
    const successLeg = new BetOption(
      "Polymarket" as never,
      "m1",
      "b1",
      "i1",
      14,
      "Away",
      1.695,
    );
    const stake = hedgeStakeCnyFromLeg(
      successLeg.odds,
      successLeg.betMoney,
      successLeg.type,
      2.63,
      pmAccount,
    );
    expect(stake).toBe(63);
  });

  it("matches raw betMoney for CNY success leg", () => {
    const successLeg = new BetOption("RAY" as never, "m1", "b1", "i1", 98, "Home", 1.695);
    const stake = hedgeStakeCnyFromLeg(
      successLeg.odds,
      successLeg.betMoney,
      successLeg.type,
      2.63,
      new PlatformAccount({ accountId: 2, provider: "RAY", playerName: "ray" }),
    );
    expect(stake).toBe(63);
  });
});

describe("retryFailedLeg PM settlement defer", () => {
  it("sets deferPmSettlement on Polymarket retry leg", async () => {
    const pmAccount = new PlatformAccount({
      accountId: 1,
      provider: "Polymarket",
      playerName: "pm",
    });
    const match = { id: 1, title: "A vs B" } as never;
    const bet = {
      id: 100,
      items: [makeItem("Polymarket", 2.5)],
    } as never;
    const successLeg = new BetOption("RAY" as never, "m1", "b1", "i1", 98, "Home", 1.695);
    const failedLeg = new BetOption("OB" as never, "m2", "b2", "a1", 70, "Away", 4.0);

    getAccount.mockReturnValue(pmAccount);
    checkBetting.mockImplementation(async (_acc, opt: BetOption) => {
      opt.data = { ok: true };
      return opt;
    });
    betting.mockResolvedValue(
      Object.assign(new BetResult("Polymarket", true), { pending: true, orderId: "0xretry" }),
    );

    const out = await retryFailedLeg(
      match,
      bet,
      successLeg,
      failedLeg,
      new PlatformAccount({ accountId: 2, provider: "RAY", playerName: "ray" }),
      { anyOdds: false, makeProfit: 1.01, noSameBet: false } as never,
      10,
    );

    expect(out?.leg.deferPmSettlement).toBe(true);
    expect(betting).toHaveBeenCalledWith(
      pmAccount,
      expect.objectContaining({ deferPmSettlement: true }),
      10,
    );
  });
});
