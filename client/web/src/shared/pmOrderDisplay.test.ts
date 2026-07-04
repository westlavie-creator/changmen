import { describe, expect, it } from "vitest";
import {
  formatPolymarketApiDecimal,
  isPmOrderListRow,
  pmOrderFillPriceText,
  pmOrderOddsText,
  pmOrderSharesText,
  resolvePmFillPrice,
} from "./pmOrderDisplay";
import type { OrderRow } from "@/types/order";

const pmBuy: OrderRow = {
  Type: "Polymarket",
  PmSide: "buy",
  PmShares: 6.756753,
  PmFillPrice: 0.74,
  PmStakeUsdc: 5,
  Odds: 1.3514,
  BetMoney: 35,
};

describe("pmOrderDisplay", () => {
  it("detects PM buy rows for list layout", () => {
    expect(isPmOrderListRow(pmBuy)).toBe(true);
    expect(isPmOrderListRow({ ...pmBuy, PmSide: "sell" })).toBe(false);
    expect(isPmOrderListRow({ ...pmBuy, Type: "RAY" })).toBe(false);
  });

  it("shows API fill price and share count without rounding", () => {
    expect(resolvePmFillPrice(pmBuy)).toBe(0.74);
    expect(pmOrderFillPriceText(pmBuy)).toBe("0.74");
    expect(pmOrderSharesText(pmBuy)).toBe("6.756753");
  });

  it("truncates display odds from stored fill price", () => {
    expect(pmOrderOddsText(pmBuy)).toBe("1.351");
  });

  it("formats API decimals without trailing zeros", () => {
    expect(formatPolymarketApiDecimal(0.68, 6)).toBe("0.68");
    expect(formatPolymarketApiDecimal(7.352941, 6)).toBe("7.352941");
  });
});
