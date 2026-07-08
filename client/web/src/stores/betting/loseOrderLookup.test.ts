import { describe, expect, it } from "vitest";
import { buildLoseOrderBetLookup, resolveLoseOrderBetRef } from "@/stores/betting/loseOrderLookup";

describe("buildLoseOrderBetLookup", () => {
  it("maps betId to match and bet", () => {
    const match = { id: 10, bets: [{ id: 1 }, { id: 2 }] } as const;
    const lookup = buildLoseOrderBetLookup([match as never]);

    expect(lookup.get(1)?.match.id).toBe(10);
    expect(lookup.get(2)?.bet.id).toBe(2);
    expect(lookup.get(99)).toBeUndefined();
  });
});

describe("resolveLoseOrderBetRef", () => {
  it("prefers lookup when matchId matches", () => {
    const match = { id: 10, bets: [{ id: 1 }] } as const;
    const lookup = buildLoseOrderBetLookup([match as never]);
    const ref = resolveLoseOrderBetRef({ betId: 1, matchId: 10 }, [match as never], lookup);
    expect(ref?.match.id).toBe(10);
    expect(ref?.bet.id).toBe(1);
  });

  it("falls back to matchId when betId collides across matches", () => {
    const matchA = { id: 10, bets: [{ id: 1 }] } as const;
    const matchB = { id: 20, bets: [{ id: 1 }] } as const;
    const lookup = buildLoseOrderBetLookup([matchA as never, matchB as never]);
    const ref = resolveLoseOrderBetRef({ betId: 1, matchId: 20 }, [matchA as never, matchB as never], lookup);
    expect(ref?.match.id).toBe(20);
  });

  it("returns undefined when stored matchId missing from list (no stale lookup)", () => {
    const matchA = { id: 10, bets: [{ id: 1 }] } as const;
    const lookup = buildLoseOrderBetLookup([matchA as never]);
    const ref = resolveLoseOrderBetRef({ betId: 1, matchId: 20 }, [matchA as never], lookup);
    expect(ref).toBeUndefined();
  });
});
