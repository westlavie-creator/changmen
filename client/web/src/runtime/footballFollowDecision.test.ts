import { describe, expect, test } from "vitest";
import { resolveFootballFollowDecision } from "@/runtime/footballFollowDecision";
import type { FootballFollowSelectionShadow } from "@/runtime/footballFollowSelectionKey";

const selectionShadow: FootballFollowSelectionShadow = {
  key: {
    matchKey: "OB:123",
    venue: "OB",
    sourceMatchId: "123",
    period: "full",
    marketCode: "totals",
    line: 2.5,
    side: "over",
    oddId: "oid-over",
    confidence: "exact",
  },
  legacy: {
    obMid: "123",
    oid: "oid-over",
    venue: "OB",
    marketCode: "totals",
    line: 2.5,
    side: "over",
  },
  sameOddId: true,
  reason: "ok",
};

const base = {
  ticket: { id: "ticket-1", stake: 100 },
  fixtureMatch: { status: "matched" as const, basis: "confirmed" as const },
  marketMatch: {
    status: "matched" as const,
    ob: true,
    locked: false,
    oid: "oid-over",
    fromLive: true,
  },
  quote: {
    status: "ok" as const,
    quote: 1.95,
    minObOdds: 1.9,
  },
  selectionShadow,
};

describe("football follow decision shadow", () => {
  test("allows manual and auto only when the legacy result is fully ready", () => {
    const decision = resolveFootballFollowDecision(base);

    expect(decision.ticketId).toBe("ticket-1");
    expect(decision.fixture).toEqual({ status: "matched", confidence: "exact", reason: "confirmed" });
    expect(decision.market.status).toBe("matched");
    expect(decision.quote.status).toBe("ok");
    expect(decision.action).toEqual({
      canManualPlace: true,
      canAutoPlace: true,
      blockReason: null,
    });
  });

  test("keeps guessed fixtures manual-only in the shadow decision", () => {
    const decision = resolveFootballFollowDecision({
      ...base,
      fixtureMatch: { status: "matched", basis: "guess" },
    });

    expect(decision.fixture.confidence).toBe("guess");
    expect(decision.action.canManualPlace).toBe(true);
    expect(decision.action.canAutoPlace).toBe(false);
  });

  test("blocks when the market has not matched", () => {
    const decision = resolveFootballFollowDecision({
      ...base,
      marketMatch: { ...base.marketMatch, status: "none" },
    });

    expect(decision.market).toEqual({ status: "none", reason: "market_unmatched" });
    expect(decision.action).toMatchObject({
      canManualPlace: false,
      canAutoPlace: false,
      blockReason: "盘未对上",
    });
  });

  test("maps quote states to non-mutating block reasons", () => {
    const locked = resolveFootballFollowDecision({
      ...base,
      marketMatch: { ...base.marketMatch, locked: true },
      quote: { status: "locked", quote: 0, minObOdds: 1.9 },
    });
    const short = resolveFootballFollowDecision({
      ...base,
      quote: { status: "short", quote: 1.8, minObOdds: 1.9 },
    });

    expect(locked.quote.status).toBe("locked");
    expect(locked.action.blockReason).toBe("锁盘");
    expect(short.quote.status).toBe("below_min");
    expect(short.action.blockReason).toBe("OB 价不够");
  });
});
