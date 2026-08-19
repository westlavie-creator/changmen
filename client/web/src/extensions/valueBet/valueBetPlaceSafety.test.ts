import { describe, expect, it } from "vitest";
import { evaluateValueBetPlaceSafety } from "@/extensions/valueBet/valueBetPlaceSafety";

describe("evaluateValueBetPlaceSafety", () => {
  const base = {
    amount: 100,
    edge: 0.05,
    minEdge: 0.03,
    muted: false,
    checkMute: true,
    mapCount: 0,
    maxPerMap: 1,
    checkMapLimit: true,
    sharpOdds: 1.9,
    minOdds: 1.3,
    maxOdds: 10,
    checkOddsRange: true,
  };

  it("allows a valid auto place", () => {
    expect(evaluateValueBetPlaceSafety(base)).toBeNull();
  });

  it("blocks bad amount / vanished edge", () => {
    expect(evaluateValueBetPlaceSafety({ ...base, amount: 0 })).toBe("amount");
    expect(evaluateValueBetPlaceSafety({ ...base, amount: Number.NaN })).toBe("amount");
    expect(evaluateValueBetPlaceSafety({ ...base, edge: 0.02 })).toBe("edge");
    expect(evaluateValueBetPlaceSafety({ ...base, maxEdge: 0.04, edge: 0.05 })).toBe("edge");
  });

  it("enforces mute, map cap and sharp odds only when those checks are on", () => {
    expect(evaluateValueBetPlaceSafety({ ...base, muted: true })).toBe("muted");
    expect(evaluateValueBetPlaceSafety({ ...base, mapCount: 1 })).toBe("map_limit");
    expect(evaluateValueBetPlaceSafety({ ...base, sharpOdds: 1.2 })).toBe("odds_range");
    expect(evaluateValueBetPlaceSafety({
      ...base,
      muted: true,
      mapCount: 1,
      sharpOdds: 1.2,
      checkMute: false,
      checkMapLimit: false,
      checkOddsRange: false,
    })).toBeNull();
  });
});
