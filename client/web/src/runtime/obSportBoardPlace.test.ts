import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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

  it("does not fall back to the deprecated default POD stake", () => {
    const source = readFileSync(join(process.cwd(), "src/runtime/obSportBoardPlace.ts"), "utf8");
    expect(source).toMatch(/defaultStake:\s*Number\(settings\.obStake\) \|\| 0/);
    expect(source).not.toMatch(/defaultStake:[\s\S]{0,80}settings\.stake/);
  });
});
