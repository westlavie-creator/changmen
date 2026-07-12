import { describe, expect, it } from "vitest";
import { BetOption } from "@/models/betOption";
import {
  arbLegsIncludePolymarket,
} from "@changmen/arb-core";

function leg(type: string, odds: number, betMoney: number): BetOption {
  return new BetOption(type as never, "m1", "b1", "i1", betMoney, "Home", odds);
}

describe("arbLegsIncludePolymarket", () => {
  it("detects Polymarket on either leg", () => {
    expect(arbLegsIncludePolymarket(leg("RAY", 1.5, 80), leg("Polymarket", 3, 40))).toBe(true);
    expect(arbLegsIncludePolymarket(leg("OB", 1.5, 80), leg("RAY", 2, 40))).toBe(false);
  });
});
