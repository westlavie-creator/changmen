import { describe, expect, it } from "vitest";
import { formatObSportBoardPlaceTitle } from "@/runtime/obSportBoardPlace";

describe("obSportBoardPlace", () => {
  it("formats confirm title", () => {
    expect(formatObSportBoardPlaceTitle({
      oid: "1",
      mid: "2",
      odds: 1.95,
      boardSide: "over",
      marketCode: "totals",
      line: 2.5,
      home: "A",
      away: "B",
    })).toBe("A vs B · 全场大小 2.5 · 大 @ 1.95");
  });
});
