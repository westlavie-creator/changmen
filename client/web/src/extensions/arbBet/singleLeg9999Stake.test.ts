import { describe, expect, it } from "vitest";
import { BetOption } from "@/models/betOption";
import {
  applyValueBetMoneyTo9999LiveLeg,
  resolve9999LiveSide,
} from "@/extensions/arbBet/singleLeg9999Stake";
import { createDefaultUserConfig } from "@/types/userConfig";

function leg(odds: number, betMoney: number): BetOption {
  return new BetOption("RAY" as never, "m1", "b1", "i1", betMoney, "Home", odds);
}

describe("resolve9999LiveSide", () => {
  it("returns the side with live account", () => {
    expect(resolve9999LiveSide({ id: 1 }, undefined)).toBe("A");
    expect(resolve9999LiveSide(undefined, { id: 2 })).toBe("B");
    expect(resolve9999LiveSide({ id: 1 }, { id: 2 })).toBeNull();
    expect(resolve9999LiveSide(undefined, undefined)).toBeNull();
  });
});

describe("applyValueBetMoneyTo9999LiveLeg", () => {
  it("does nothing when disabled or not 9999", () => {
    const a = leg(2, 80);
    const b = leg(2.2, 35);
    const config = { ...createDefaultUserConfig(), valueBetMoney: 100 };
    expect(applyValueBetMoneyTo9999LiveLeg({
      singleLegByRate: true,
      enabled: false,
      config,
      legA: a,
      legB: b,
      liveSide: "B",
    })).toBeNull();
    expect(b.betMoney).toBe(35);

    expect(applyValueBetMoneyTo9999LiveLeg({
      singleLegByRate: false,
      enabled: true,
      config,
      legA: a,
      legB: b,
      liveSide: "B",
    })).toBeNull();
  });

  it("rewrites only the live leg to valueBetMoney", () => {
    const a = leg(2, 80);
    const b = leg(2.2, 35);
    const config = { ...createDefaultUserConfig(), valueBetMoney: 100, tenNumber: false };
    expect(applyValueBetMoneyTo9999LiveLeg({
      singleLegByRate: true,
      enabled: true,
      config,
      legA: a,
      legB: b,
      liveSide: "B",
    })).toBe(100);
    expect(a.betMoney).toBe(80);
    expect(b.betMoney).toBe(100);
  });

  it("respects tenNumber rounding", () => {
    const a = leg(2, 80);
    const b = leg(2.2, 35);
    const config = { ...createDefaultUserConfig(), valueBetMoney: 105, tenNumber: true };
    expect(applyValueBetMoneyTo9999LiveLeg({
      singleLegByRate: true,
      enabled: true,
      config,
      legA: a,
      legB: b,
      liveSide: "A",
    })).toBe(110);
    expect(a.betMoney).toBe(110);
    expect(b.betMoney).toBe(35);
  });
});
