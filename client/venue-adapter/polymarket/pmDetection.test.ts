import { describe, expect, test } from "vitest";
import type { BetOption } from "@/models/betOption";
import {
  detectionMaxPriceFromOdds,
  resolvePolymarketDetectionMaxPrice,
} from "./pmDetection";

function optionWithData(data: Record<string, unknown> | null, odds = 1.471): BetOption {
  return {
    odds,
    data,
  } as BetOption;
}

describe("resolvePolymarketDetectionMaxPrice", () => {
  test("prefers fo clobPrice over rounded display odds", () => {
    expect(resolvePolymarketDetectionMaxPrice(
      optionWithData({ detectionClobPrice: 0.68 }),
      1.471,
    )).toBe(0.68);
  });

  test("falls back to 1/odds when clobPrice missing", () => {
    expect(resolvePolymarketDetectionMaxPrice(optionWithData(null), 5)).toBe(0.2);
    expect(detectionMaxPriceFromOdds(1.471)).toBe(0.6798);
  });

  test("keeps locked detection cap after fo would move", () => {
    expect(resolvePolymarketDetectionMaxPrice(
      optionWithData({ detectionOdds: 1.471, detectionMaxPrice: 0.68, detectionClobPrice: 0.69 }),
      1.471,
    )).toBe(0.68);
  });
});
