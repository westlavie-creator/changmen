import { describe, expect, it } from "vitest";
import { BetOption } from "@/models/betOption";
import {
  applyArbHedgeStakes,
  impliedFromLegOdds,
} from "@changmen/arb-core";
import { createDefaultUserConfig } from "@/types/userConfig";

function leg(type: string, odds: number, betMoney: number): BetOption {
  return new BetOption(type as never, "m1", "b1", "i1", betMoney, "Home", odds);
}

describe("arbStakeMath (A8)", () => {
  it("computes implied from leg odds", () => {
    expect(impliedFromLegOdds(leg("RAY", 1.36, 80), leg("PB", 3.125, 35)))
      .toBeCloseTo(0.948, 3);
    expect(impliedFromLegOdds(leg("RAY", 1.36, 80), leg("PB", 5, 22)))
      .toBeCloseTo(1.07, 2);
  });

  it("recalculates hedge stake after odds move", () => {
    const config = createDefaultUserConfig();
    const legA = leg("RAY", 1.36, 80);
    const legB = leg("PB", 3.125, 20);
    applyArbHedgeStakes(legA, legB, 80, config);
    expect(legA.betMoney).toBe(80);
    expect(legB.betMoney).toBeCloseTo(35, 0);
  });
});
