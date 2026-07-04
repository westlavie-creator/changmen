import { describe, expect, it } from "vitest";
import { BetOption } from "@/models/betOption";
import { PlatformAccount } from "@/models/platformAccount";
import {
  applyPmArbHedgeAfterPrecheck,
  hedgeStakeCnyFromLeg,
  legStakeCny,
  restoreLegStakeCnyBeforeRecheck,
  splitPmA8Legs,
} from "@/domain/polymarket/pmArbStake";
import { createDefaultUserConfig } from "@/types/userConfig";

function leg(type: string, odds: number, betMoney: number): BetOption {
  return new BetOption(type as never, "m1", "b1", "i1", betMoney, "Home", odds);
}

describe("pmArbStake", () => {
  it("converts PM USDT stake to CNY", () => {
    const pmAccount = new PlatformAccount({
      accountId: 1,
      provider: "Polymarket",
      playerName: "pm",
      currency: "USDT",
    });
    expect(legStakeCny(14, "Polymarket", pmAccount)).toBe(98);
  });

  it("applyPmArbHedgeAfterPrecheck hedges RAY when PM is low-odds primary", () => {
    const config = { ...createDefaultUserConfig(), tenNumber: true };
    const legA = leg("RAY", 2.63, 10);
    const legB = leg("Polymarket", 1.695, 14);
    const accountA = new PlatformAccount({ accountId: 1, provider: "RAY", playerName: "ray" });
    const accountB = new PlatformAccount({
      accountId: 2,
      provider: "Polymarket",
      playerName: "pm",
      currency: "USDT",
    });

    const adjustment = applyPmArbHedgeAfterPrecheck(legA, legB, config, accountA, accountB);

    expect(adjustment?.changedLeg).toBe("a8");
    expect(legB.betMoney).toBe(14);
    expect(legA.betMoney).toBe(60);
  });

  it("applyPmArbHedgeAfterPrecheck only changes PM when RAY is low-odds primary", () => {
    const config = { ...createDefaultUserConfig(), betMoney: 36 };
    const legA = leg("RAY", 1.72, 18);
    const legB = leg("Polymarket", 2.632, 14);
    const accountA = new PlatformAccount({
      accountId: 1,
      provider: "RAY",
      playerName: "nip",
      rateConfig: [{ minOdds: 0, maxOdds: 0, rate: 0.5 }],
    });
    const accountB = new PlatformAccount({
      accountId: 2,
      provider: "Polymarket",
      playerName: "pm",
      currency: "USDT",
    });

    const adjustment = applyPmArbHedgeAfterPrecheck(legA, legB, config, accountA, accountB);

    expect(adjustment?.changedLeg).toBe("pm");
    expect(legA.betMoney).toBe(18);
    expect(legB.betMoney).toBe(3);
  });

  it("restoreLegStakeCnyBeforeRecheck restores RAY CNY plan before rate re-apply", () => {
    const legA = leg("RAY", 2.63, 30);
    const accountA = new PlatformAccount({
      accountId: 1,
      provider: "RAY",
      playerName: "nip",
      rateConfig: [{ minOdds: 0, maxOdds: 0, rate: 0.5 }],
    });

    restoreLegStakeCnyBeforeRecheck(legA, accountA);

    expect(legA.betMoney).toBe(60);
    expect(accountA.getBetMoney(legA.betMoney, legA.odds)).toBe(30);
  });

  it("hedgeStakeCnyFromLeg uses PM success stake in CNY", () => {
    const pmAccount = new PlatformAccount({
      accountId: 1,
      provider: "Polymarket",
      playerName: "pm",
      currency: "USDT",
    });
    expect(hedgeStakeCnyFromLeg(1.695, 14, "Polymarket", 2.63, pmAccount)).toBe(63);
  });

  it("splitPmA8Legs identifies PM leg on either side", () => {
    const legA = leg("RAY", 1.72, 18);
    const legB = leg("Polymarket", 2.632, 14);
    const pair = splitPmA8Legs(legA, legB);
    expect(pair.pmLeg).toBe(legB);
    expect(pair.a8Leg).toBe(legA);
  });

  it("returns null when PM hedge already matches reconcile target", () => {
    const config = { ...createDefaultUserConfig(), betMoney: 80 };
    const legA = leg("RAY", 1.36, 80);
    const legB = leg("Polymarket", 5, 3);
    const accountB = new PlatformAccount({
      accountId: 2,
      provider: "Polymarket",
      playerName: "pm",
      currency: "USDT",
    });

    expect(applyPmArbHedgeAfterPrecheck(legA, legB, config, undefined, accountB)).toBeNull();
    expect(legA.betMoney).toBe(80);
    expect(legB.betMoney).toBe(3);
  });
});
