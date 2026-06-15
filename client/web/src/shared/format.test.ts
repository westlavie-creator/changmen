import { describe, expect, it } from "vitest";
import { arbPercent, arbProfitRate, classifyLinkId, formatDisplayOdds, formatLinkId, formatSecond, isSingleLegLink, linkIdSourceLabel, percent, toFixed } from "./format";

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

  it("converts implied multiplier to profit rate", () => {
    expect(arbProfitRate(1.05)).toBe("5.0%");
    expect(arbProfitRate(1.032, 2)).toBe("3.20%");
  });

  it("formats single-leg link id with gb prefix", () => {
    expect(isSingleLegLink(-1710000000123)).toBe(true);
    expect(isSingleLegLink(1710000000123)).toBe(false);
    expect(formatLinkId(-1710000000123)).toBe("gb1710000000123");
    expect(formatLinkId(42)).toBe("42");
    expect(formatLinkId(0)).toBe("—");
  });

  it("classifies link id source for admin tags", () => {
    expect(classifyLinkId(1781532641651)).toBe("arb");
    expect(linkIdSourceLabel("arb")).toBe("系统");
    expect(classifyLinkId(-1781532641651)).toBe("single");
    expect(linkIdSourceLabel("single")).toBe("单边");
    expect(classifyLinkId(3864266867)).toBe("external");
    expect(linkIdSourceLabel("external")).toBe("外部");
    expect(classifyLinkId(0)).toBeNull();
  });
});
