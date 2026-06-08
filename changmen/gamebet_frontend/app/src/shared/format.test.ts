import { describe, expect, it } from "vitest";
import { arbPercent, formatDisplayOdds, formatSecond, percent, toFixed } from "./format";

describe("format shared helpers", () => {
  it("rounds display odds to three decimals and drops invalid values", () => {
    expect(formatDisplayOdds(1.23456)).toBe(1.235);
    expect(formatDisplayOdds(0)).toBe(0);
    expect(formatDisplayOdds(Number.NaN)).toBe(0);
  });

  it("formats seconds without allowing negative time", () => {
    expect(formatSecond(125.9)).toBe("2:05");
    expect(formatSecond(-3)).toBe("0:00");
  });

  it("formats fixed decimals and percentages", () => {
    expect(toFixed(1.239, 2, "floor")).toBe("1.23");
    expect(toFixed(1.239, 2, "round")).toBe("1.24");
    expect(percent(0.1234, 1)).toBe("12.3%");
    expect(percent(Number.NaN)).toBe("N/A");
  });

  it("computes arbitrage percentage from both sides", () => {
    expect(arbPercent(2, 2)).toBe("100.0%");
    expect(arbPercent(0, 2)).toBe("N/A");
  });
});
