import { describe, expect, test } from "vitest";
import {
  compareFootballFollowShadow,
  type CompareFootballFollowShadowInput,
} from "@/runtime/footballFollowShadowCompare";

function baseInput(): CompareFootballFollowShadowInput {
  return {
    marketMatch: {
      status: "matched" as const,
      oid: "oid-1",
      quote: 1.91,
      locked: false,
    },
    obQuote: {
      status: "ok" as const,
      quote: 1.91,
    },
    selectionShadow: {
      key: {
        sourceMatchId: "mid-1",
        period: "full" as const,
        marketCode: "totals" as const,
        line: 2.5,
        side: "over" as const,
        oddId: "oid-1",
        confidence: "exact" as const,
      },
      legacy: {
        obMid: "mid-1",
        marketCode: "totals",
        line: 2.5,
        side: "over" as const,
        oid: "oid-1",
        venue: "OB",
      },
      reason: "ok",
      sameOddId: true,
    },
    quoteShadow: {
      odds: 1.91,
      locked: false,
      source: "live" as const,
    },
    decisionShadow: {
      action: {
        canManualPlace: true,
        canAutoPlace: true,
        blockReason: null as string | null,
      },
    },
  };
}

describe("football follow shadow compare", () => {
  test("returns ok when legacy and shadow agree", () => {
    expect(compareFootballFollowShadow(baseInput())).toEqual({
      ok: true,
      reasons: [],
      summary: "ok",
    });
  });

  test("reports odd id mismatch", () => {
    const input = baseInput();
    input.selectionShadow.key = {
      sourceMatchId: "mid-1",
      period: "full",
      marketCode: "totals",
      line: 2.5,
      side: "over",
      oddId: "oid-2",
      confidence: "exact",
    };
    input.selectionShadow.sameOddId = false;

    const result = compareFootballFollowShadow(input);
    expect(result.ok).toBe(false);
    expect(result.summary).toContain("oid:oid-1->oid-2");
  });

  test("reports quote mismatch outside tolerance", () => {
    const input = baseInput();
    input.quoteShadow.odds = 1.95;

    const result = compareFootballFollowShadow(input);
    expect(result.ok).toBe(false);
    expect(result.summary).toContain("quote:1.91->1.95");
  });

  test("reports selection identity mismatches beyond odd id", () => {
    const input = baseInput();
    input.selectionShadow.key = {
      sourceMatchId: "mid-2",
      period: "half",
      marketCode: "spreads",
      line: -0.5,
      side: "away",
      oddId: "oid-1",
      confidence: "exact",
    };

    const result = compareFootballFollowShadow(input);
    expect(result.reasons).toContain("mid:mid-1->mid-2");
    expect(result.reasons).toContain("period:full->half");
    expect(result.reasons).toContain("market:totals->spreads");
    expect(result.reasons).toContain("line:2.5->-0.5");
    expect(result.reasons).toContain("side:over->away");
  });

  test("reports lock and decision mismatch", () => {
    const input = baseInput();
    input.quoteShadow.locked = true;
    input.decisionShadow.action.blockReason = "锁盘";

    const result = compareFootballFollowShadow(input);
    expect(result.ok).toBe(false);
    expect(result.reasons).toContain("lock:shadow");
    expect(result.reasons).toContain("decision:锁盘");
  });

  test("reports legacy gate mismatches without changing the gate", () => {
    const input = baseInput();
    input.legacyBlock = "无 OB mid";

    const result = compareFootballFollowShadow(input);
    expect(result.ok).toBe(false);
    expect(result.reasons).toContain("gate:无 OB mid->ok");
  });
});
