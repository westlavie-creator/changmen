import { describe, expect, it, vi } from "vitest";
import { BetOption } from "@/models/betOption";
import { PlatformAccount } from "@/models/platformAccount";
import { hedgeStakeCnyFromLeg } from "@/domain/polymarket/pmArbStake";

vi.mock("@/stores/accountStore", () => ({
  useAccountStore: () => ({
    getAccount: vi.fn(),
    checkBetting: vi.fn(),
    betting: vi.fn(),
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
