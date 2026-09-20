import { describe, expect, test } from "vitest";
import { getFootballQuote } from "@/runtime/footballQuote";

const key = {
  venue: "OB",
  oddId: "oid-1",
  line: 2.5,
};

describe("football quote shadow reader", () => {
  test("uses live odds first and keeps pushed line", () => {
    const quote = getFootballQuote({
      key,
      fallbackOdds: 1.8,
      reader: {
        hasLive: () => true,
        getLive: () => 1.93,
        getPrefetch: () => 1.91,
        getLine: () => 2.75,
      },
    });

    expect(quote).toEqual({
      odds: 1.93,
      line: 2.75,
      locked: false,
      source: "live",
    });
  });

  test("treats known live zero as locked instead of falling through", () => {
    const quote = getFootballQuote({
      key,
      fallbackOdds: 1.8,
      reader: {
        hasLive: () => true,
        getLive: () => 0,
        getPrefetch: () => 2.1,
      },
    });

    expect(quote.source).toBe("live");
    expect(quote.locked).toBe(true);
    expect(quote.odds).toBe(0);
  });

  test("uses prefetch before http fallback when live is absent", () => {
    const quote = getFootballQuote({
      key,
      fallbackOdds: 1.8,
      reader: {
        hasLive: () => false,
        getPrefetch: () => 1.91,
      },
    });

    expect(quote).toMatchObject({
      odds: 1.91,
      source: "prefetch",
      locked: false,
    });
  });

  test("falls back to the passed snapshot odds", () => {
    const quote = getFootballQuote({
      key,
      fallbackOdds: 1.82,
      reader: {
        hasLive: () => false,
        getPrefetch: () => 0,
      },
    });

    expect(quote).toEqual({
      odds: 1.82,
      line: 2.5,
      locked: false,
      source: "http",
    });
  });
});
