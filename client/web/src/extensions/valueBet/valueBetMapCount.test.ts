import { afterEach, describe, expect, it } from "vitest";
import {
  getValueBetMapCount,
  recordValueBetMapFill,
  resetValueBetMapCountForTests,
} from "@/extensions/valueBet/valueBetMapCount";

describe("valueBetMapCount", () => {
  afterEach(() => {
    resetValueBetMapCountForTests();
  });

  it("starts at 0 and increments per match:round", () => {
    expect(getValueBetMapCount(10, 1)).toBe(0);
    expect(recordValueBetMapFill(10, 1)).toBe(1);
    expect(recordValueBetMapFill(10, 1)).toBe(2);
    expect(getValueBetMapCount(10, 0)).toBe(0);
    expect(recordValueBetMapFill(10, 0)).toBe(1);
  });
});
