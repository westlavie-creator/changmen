import { describe, expect, test } from "vitest";
import { buildPmSellQuoteView, pmStakeUsdcFromRow } from "./pmSellQuotes";

describe("pmSellQuotes", () => {
  test("pmStakeUsdcFromRow prefers stored usdc stake", () => {
    expect(pmStakeUsdcFromRow(5, 35)).toBe(5);
    expect(pmStakeUsdcFromRow(undefined, 35)).toBe(5);
  });

  test("buildPmSellQuoteView computes display profit", () => {
    const view = buildPmSellQuoteView("t1", 10, 5, 0.6);
    expect(view?.sellOdds).toBeCloseTo(1.6667, 3);
    expect(view?.profitUsdc).toBe(1);
    expect(view?.profitDisplay).toBe(7);
  });
});
