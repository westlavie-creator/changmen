import { describe, expect, it } from "vitest";
import { calcMakeupStake } from "@/domain/betting/makeupStakeCalc";

describe("calcMakeupStake", () => {
  it("hedges stake from reference odds (100@2 → 2.5 = 80)", () => {
    expect(calcMakeupStake({ refMoney: 100, refOdds: 2, targetOdds: 2.5 })).toEqual({
      makeupMoney: 80,
      refReturn: 200,
      makeupReturn: 200,
      returnDiff: 0,
    });
  });

  it("returns null for invalid inputs", () => {
    expect(calcMakeupStake({ refMoney: 0, refOdds: 2, targetOdds: 2.5 })).toBeNull();
    expect(calcMakeupStake({ refMoney: 100, refOdds: 1, targetOdds: 2.5 })).toBeNull();
    expect(calcMakeupStake({ refMoney: 100, refOdds: 2, targetOdds: 0 })).toBeNull();
  });

  it("rounds makeup stake", () => {
    const r = calcMakeupStake({ refMoney: 100, refOdds: 1.91, targetOdds: 2.11 });
    expect(r?.makeupMoney).toBe(Math.round((100 * 1.91) / 2.11));
  });
});
