import { beforeEach, describe, expect, test } from "vitest";
import {
  clearPmExecutionMetrics,
  getPmExecutionMetrics,
  recordPmExecutionMetric,
  recordPmQuoteToFoMetric,
} from "./pmExecutionMetrics";
import { resetPmMarketWsSourceModeForTests } from "./pmMarketWsMode";
import { setPmHttpModeForTests } from "./pmTransportMode";

describe("pmExecutionMetrics", () => {
  beforeEach(() => {
    clearPmExecutionMetrics();
    resetPmMarketWsSourceModeForTests("official");
    setPmHttpModeForTests("vps");
  });

  test("records runtime route context with book metrics", () => {
    recordPmExecutionMetric({
      kind: "book",
      tokenId: "tok-1",
      bookSource: "direct-live",
      ms: 12,
      success: true,
    });

    expect(getPmExecutionMetrics()).toMatchObject([
      {
        kind: "book",
        tokenId: "tok-1",
        bookSource: "direct-live",
        wsSource: "official",
        httpMode: "vps",
        ms: 12,
        success: true,
      },
    ]);
  });

  test("records quote-to-fo rejection reasons", () => {
    recordPmQuoteToFoMetric({
      tokenId: "tok-2",
      quotePrice: 0.42,
      quoteSource: "ws",
      success: false,
      rejectReason: "missing_mapping",
    });

    expect(getPmExecutionMetrics()).toMatchObject([
      {
        kind: "quote_to_fo",
        tokenId: "tok-2",
        quotePrice: 0.42,
        quoteSource: "ws",
        success: false,
        rejectReason: "missing_mapping",
      },
    ]);
  });
});
