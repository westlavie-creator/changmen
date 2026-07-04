import { describe, expect, it } from "vitest";
import { BetOption } from "@/models/betOption";
import { PlatformAccount } from "@/models/platformAccount";
import {
  applyArbHedgeStakes,
  applyArbHedgeStakesCny,
  arbBaseStakeCny,
  hedgeStakeCnyFromLeg,
  impliedFromLegOdds,
  legStakeCny,
  resolveArbTargetProfit,
} from "@/domain/arbitrage/arbStakeMath";
import { createDefaultUserConfig } from "@/types/userConfig";

function leg(type: string, odds: number, betMoney: number): BetOption {
  return new BetOption(type as never, "m1", "b1", "i1", betMoney, "Home", odds);
}

describe("arbStakeMath", () => {
  it("computes implied from leg odds", () => {
    expect(impliedFromLegOdds(leg("RAY", 1.36, 80), leg("Polymarket", 3.125, 35)))
      .toBeCloseTo(0.948, 3);
    expect(impliedFromLegOdds(leg("RAY", 1.36, 80), leg("Polymarket", 5, 22)))
      .toBeCloseTo(1.07, 2);
  });

  it("recalculates hedge stake after odds move", () => {
    const config = createDefaultUserConfig();
    const legA = leg("RAY", 1.36, 80);
    const legB = leg("Polymarket", 3.125, 20);
    applyArbHedgeStakes(legA, legB, 80, config);
    expect(legA.betMoney).toBe(80);
    expect(legB.betMoney).toBeCloseTo(35, 0);
  });

  it("uses account profit override for target", () => {
    const config = { ...createDefaultUserConfig(), profit: 1.03 };
    const legA = leg("RAY", 2, 100);
    const legB = leg("PB", 2, 50);
    const accountA = { provider: "RAY", profit: 1.05 } as never;
    expect(resolveArbTargetProfit(config, legA, legB, accountA, undefined)).toBe(1.05);
  });

  it("converts PM USDT stake to CNY for arb base", () => {
    const pmAccount = new PlatformAccount({
      accountId: 1,
      provider: "Polymarket",
      playerName: "pm",
      currency: "USDT",
    });
    expect(legStakeCny(14, "Polymarket", pmAccount)).toBe(98);
  });

  it("applyArbHedgeStakesCny hedges RAY from PM CNY base", () => {
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
    applyArbHedgeStakesCny(
      legA,
      legB,
      arbBaseStakeCny(legA, legB, config, accountA, accountB),
      config,
      accountA,
      accountB,
    );
    expect(legB.betMoney).toBe(14);
    expect(legA.betMoney).toBe(60);
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
});
