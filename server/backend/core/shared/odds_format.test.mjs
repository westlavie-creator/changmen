import { describe, expect, it } from "vitest";
import { formatBetOdds, formatOdds } from "@changmen/shared/odds_format.js";

describe("formatOdds", () => {
  it("rounds finite odds to three decimals", () => {
    expect(formatOdds(1.23456)).toBe(1.235);
    expect(formatOdds("2.1114")).toBe(2.111);
  });

  it("normalizes invalid and zero odds to 0", () => {
    expect(formatOdds(0)).toBe(0);
    expect(formatOdds("not-a-number")).toBe(0);
    expect(formatOdds(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("formatBetOdds", () => {
  it("rounds only HomeOdds and AwayOdds while preserving the rest of the bet", () => {
    const bet = {
      SourceBetID: "b1",
      HomeOdds: 1.23456,
      AwayOdds: "2.34567",
      Status: "Normal",
    };

    expect(formatBetOdds(bet)).toEqual({
      SourceBetID: "b1",
      HomeOdds: 1.235,
      AwayOdds: 2.346,
      Status: "Normal",
    });
  });
});
