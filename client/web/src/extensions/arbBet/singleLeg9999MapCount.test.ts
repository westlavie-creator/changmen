import { afterEach, describe, expect, it } from "vitest";
import {
  getSingleLeg9999MapCount,
  getSingleLeg9999MapCountForKeys,
  hasSingleLeg9999OppositeSourceSide,
  recordSingleLeg9999MapFill,
  releaseSingleLeg9999MapFill,
  reserveSingleLeg9999MapFillKeys,
  reserveSingleLeg9999MapFill,
  resetSingleLeg9999MapCountForTests,
  singleLeg9999MapKey,
  singleLeg9999SourceMarketKey,
  singleLeg9999SourceSideKey,
} from "@/extensions/arbBet/singleLeg9999MapCount";

describe("singleLeg9999MapCount", () => {
  afterEach(() => {
    resetSingleLeg9999MapCountForTests();
  });

  it("tracks 9999 counts independently per match:round", () => {
    expect(getSingleLeg9999MapCount(10, 1)).toBe(0);
    expect(recordSingleLeg9999MapFill(10, 1)).toBe(1);
    expect(recordSingleLeg9999MapFill(10, 1)).toBe(2);
    expect(getSingleLeg9999MapCount(10, 0)).toBe(0);
    expect(recordSingleLeg9999MapFill(10, 0)).toBe(1);
  });

  it("reserves a map slot before fill and releases failed attempts", () => {
    expect(reserveSingleLeg9999MapFill(10, 1, 1)).toBe(true);
    expect(getSingleLeg9999MapCount(10, 1)).toBe(1);
    expect(reserveSingleLeg9999MapFill(10, 1, 1)).toBe(false);
    expect(releaseSingleLeg9999MapFill(10, 1)).toBe(0);
    expect(reserveSingleLeg9999MapFill(10, 1, 1)).toBe(true);
  });

  it("blocks the same venue source market even if frontend match id changes", () => {
    const sourceKey = singleLeg9999SourceMarketKey("RAY", "38444239", "18280")!;
    expect(reserveSingleLeg9999MapFillKeys([
      singleLeg9999MapKey(10, 1),
      sourceKey,
    ], 1)).toBe(true);

    expect(getSingleLeg9999MapCountForKeys([
      singleLeg9999MapKey(99, 1),
      sourceKey,
    ])).toBe(1);
    expect(reserveSingleLeg9999MapFillKeys([
      singleLeg9999MapKey(99, 1),
      sourceKey,
    ], 1)).toBe(false);
  });

  it("allows repeated 9999 on the same side but exposes an opposite-side lock", () => {
    const sourceKey = singleLeg9999SourceMarketKey("RAY", "38444239", "18280")!;
    const homeKey = singleLeg9999SourceSideKey(sourceKey, "Home")!;
    const awayKey = singleLeg9999SourceSideKey(sourceKey, "Away")!;

    expect(reserveSingleLeg9999MapFillKeys([
      singleLeg9999MapKey(10, 1),
      sourceKey,
      homeKey,
    ], 3)).toBe(true);
    expect(reserveSingleLeg9999MapFillKeys([
      singleLeg9999MapKey(10, 1),
      sourceKey,
      homeKey,
    ], 3)).toBe(true);

    expect(getSingleLeg9999MapCountForKeys([homeKey])).toBe(2);
    expect(getSingleLeg9999MapCountForKeys([awayKey])).toBe(0);
    expect(hasSingleLeg9999OppositeSourceSide(sourceKey, "Away")).toBe(true);
    expect(hasSingleLeg9999OppositeSourceSide(sourceKey, "Home")).toBe(false);
  });
});
