import { describe, expect, test } from "vitest";
import { buildFootballFollowSelectionShadow } from "@/runtime/footballFollowSelectionKey";

const fixture = {
  id: 101,
  obMid: "123456",
  pmMid: "pm-abc",
  startAt: 1_800_000,
  homeName: "Shanghai Shenhua",
  awayName: "Zhejiang FC",
};

const obSpread = {
  status: "matched" as const,
  venue: "OB",
  ob: true,
  oid: "oid-home",
  marketCode: "spreads",
  boardLine: -0.5,
  line: -0.5,
  boardSide: "home" as const,
  side: "home" as const,
};

describe("football follow selection shadow key", () => {
  test("derives a stable OB selection key from legacy fixture and market matches", () => {
    const shadow = buildFootballFollowSelectionShadow({
      fixtureMatch: { status: "matched", basis: "confirmed" },
      fixture,
      market: obSpread,
    });

    expect(shadow.reason).toBe("ok");
    expect(shadow.sameOddId).toBe(true);
    expect(shadow.key).toEqual({
      matchKey: "OB:123456",
      venue: "OB",
      sourceMatchId: "123456",
      period: "full",
      marketCode: "spreads",
      line: -0.5,
      side: "home",
      oddId: "oid-home",
      confidence: "exact",
    });
    expect(shadow.legacy.oid).toBe("oid-home");
  });

  test("keeps guessed fixture matches visibly non-exact", () => {
    const shadow = buildFootballFollowSelectionShadow({
      fixtureMatch: { status: "matched", basis: "guess" },
      fixture,
      market: { ...obSpread, marketCode: "ht_totals", boardLine: 2.5, line: 2.5, boardSide: "over", side: "over" },
    });

    expect(shadow.reason).toBe("ok");
    expect(shadow.key?.period).toBe("half");
    expect(shadow.key?.marketCode).toBe("totals");
    expect(shadow.key?.confidence).toBe("guess");
  });

  test("does not invent a key when the legacy market did not match", () => {
    const shadow = buildFootballFollowSelectionShadow({
      fixtureMatch: { status: "matched", basis: "confirmed" },
      fixture,
      market: { ...obSpread, status: "none" },
    });

    expect(shadow.key).toBeNull();
    expect(shadow.reason).toBe("market_unmatched");
  });
});
