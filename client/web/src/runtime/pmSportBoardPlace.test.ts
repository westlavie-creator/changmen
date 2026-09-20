import { describe, expect, it } from "vitest";
import { formatPmSportBoardPlaceTitle } from "@/runtime/pmSportBoardPlace";

describe("pmSportBoardPlace", () => {
  it("formats confirm title", () => {
    expect(formatPmSportBoardPlaceTitle({
      oid: "token",
      betId: "cond",
      odds: 2.12,
      boardSide: "away",
      marketCode: "spreads",
      line: -0.5,
      home: "A",
      away: "B",
    })).toBe("A vs B · 全场让球 -0.5 · 客 @ 2.12");
  });
});
