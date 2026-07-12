import { describe, expect, it } from "vitest";
import { BetOption } from "@changmen/client-core/models/betOption";
import {
  applyStakeScaleByProfit,
  shouldScaleStakeByProfit,
  shouldSkipAccountRateOnStakeScale,
} from "@/extensions/arbBet/stakeScaleByProfit";
import { createDefaultStakeScaleByProfit } from "@/types/extensionPrefs";

function leg(odds: number, betMoney: number): BetOption {
  return new BetOption("RAY" as never, "m1", "b1", "i1", betMoney, "Home", odds);
}

describe("stakeScaleByProfit", () => {
  it("disabled by default", () => {
    const prefs = createDefaultStakeScaleByProfit();
    expect(shouldScaleStakeByProfit(1.08, prefs)).toBe(false);
  });

  it("scales both legs when implied >= minImplied", () => {
    const prefs = { enabled: true, minImplied: 1.05, multiplier: 2, skipAccountRateOnScale: false };
    const a = leg(2, 100);
    const b = leg(2.2, 91);
    expect(applyStakeScaleByProfit(a, b, 1.05, prefs)).toBe(2);
    expect(a.betMoney).toBe(200);
    expect(b.betMoney).toBe(182);
  });

  it("does not scale below threshold", () => {
    const prefs = { enabled: true, minImplied: 1.05, multiplier: 2, skipAccountRateOnScale: false };
    const a = leg(2, 100);
    const b = leg(2.1, 95);
    expect(applyStakeScaleByProfit(a, b, 1.049, prefs)).toBe(1);
    expect(a.betMoney).toBe(100);
  });

  it("ignores multiplier 1", () => {
    expect(shouldScaleStakeByProfit(1.1, { enabled: true, minImplied: 1.05, multiplier: 1, skipAccountRateOnScale: false }))
      .toBe(false);
  });

  it("skipAccountRateOnScale only when stake scaled", () => {
    const prefs = { enabled: true, minImplied: 1.05, multiplier: 2, skipAccountRateOnScale: true };
    expect(shouldSkipAccountRateOnStakeScale(2, prefs)).toBe(true);
    expect(shouldSkipAccountRateOnStakeScale(1, prefs)).toBe(false);
    expect(shouldSkipAccountRateOnStakeScale(2, { ...prefs, skipAccountRateOnScale: false })).toBe(false);
  });
});
