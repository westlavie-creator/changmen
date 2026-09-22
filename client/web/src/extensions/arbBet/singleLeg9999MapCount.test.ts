import { afterEach, describe, expect, it } from "vitest";
import {
  getSingleLeg9999MapCount,
  recordSingleLeg9999MapFill,
  resetSingleLeg9999MapCountForTests,
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
});
