import { afterEach, describe, expect, test, vi } from "vitest";
import {
  notePolymarketLiveBookQuote,
  resetPolymarketLiveQuoteTsForTests,
  shouldApplyPolymarketWsQuote,
} from "./pmTokenQuote";

describe("shouldApplyPolymarketWsQuote", () => {
  afterEach(() => {
    resetPolymarketLiveQuoteTsForTests();
    vi.useRealTimers();
  });

  test("applies first quote without timestamp", () => {
    expect(shouldApplyPolymarketWsQuote("tok")).toBe(true);
  });

  test("drops older exchange timestamp", () => {
    expect(shouldApplyPolymarketWsQuote("tok", 2000)).toBe(true);
    expect(shouldApplyPolymarketWsQuote("tok", 1999)).toBe(false);
    expect(shouldApplyPolymarketWsQuote("tok", 2001)).toBe(true);
  });

  test("after fo correction, drops timestamp-less WS for 2s", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
    notePolymarketLiveBookQuote("tok");
    expect(shouldApplyPolymarketWsQuote("tok")).toBe(false);
    vi.setSystemTime(1_700_000_000_000 + 1_999);
    expect(shouldApplyPolymarketWsQuote("tok")).toBe(false);
    vi.setSystemTime(1_700_000_000_000 + 2_001);
    expect(shouldApplyPolymarketWsQuote("tok")).toBe(true);
  });
});
