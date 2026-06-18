import { describe, expect, it } from "vitest";
import { buildLoseOrderBetLookup } from "@/stores/betting/loseOrderLookup";

describe("buildLoseOrderBetLookup", () => {
  it("maps betId to match and bet", () => {
    const match = { id: 10, bets: [{ id: 1 }, { id: 2 }] } as const;
    const lookup = buildLoseOrderBetLookup([match as never]);

    expect(lookup.get(1)?.match.id).toBe(10);
    expect(lookup.get(2)?.bet.id).toBe(2);
    expect(lookup.get(99)).toBeUndefined();
  });
});
