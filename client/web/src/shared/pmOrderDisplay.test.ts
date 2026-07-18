import { describe, expect, it } from "vitest";
import {
  formatPolymarketApiDecimal,
  isPmOrderListRow,
  clobPriceFromDecimalOdds,
  clobPriceFromFoOddsEntry,
  pmOddsTextFromClobPrice,
  pmOrderDisplayPriceText,
  pmOrderFillPriceText,
  pmOrderOddsText,
  pmOrderSharesText,
  resolvePmFillPrice,
  resolvePmListDisplayPrice,
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
  Status: "None",
};

describe("pmOrderDisplay", () => {
  it("detects PM rows for list layout (buy and sell)", () => {
    expect(isPmOrderListRow(pmBuy)).toBe(true);
    expect(isPmOrderListRow({ ...pmBuy, PmSide: "sell" })).toBe(true);
    expect(isPmOrderListRow({ ...pmBuy, Type: "RAY" })).toBe(false);
  });

  it("shows API fill price and share count without rounding", () => {
    expect(resolvePmFillPrice(pmBuy)).toBe(0.74);
    expect(pmOrderFillPriceText(pmBuy)).toBe("0.74");
    expect(pmOrderSharesText(pmBuy)).toBe("6.756753");
  });

  it("prefers fo live price for unsettled buys", () => {
    expect(resolvePmListDisplayPrice(pmBuy, 0.61)).toBe(0.61);
    expect(pmOrderDisplayPriceText(pmBuy, 0.61)).toBe("0.61");
  });

  it("keeps fill price after close / sell / settled", () => {
    expect(resolvePmListDisplayPrice({ ...pmBuy, PmSellState: "closed" }, 0.61)).toBe(0.74);
    expect(resolvePmListDisplayPrice({ ...pmBuy, PmSide: "sell" }, 0.61)).toBe(0.74);
    expect(resolvePmListDisplayPrice({ ...pmBuy, Status: "Win" }, 0.61)).toBe(0.74);
  });

  it("odds text stays on fill price", () => {
    expect(pmOrderOddsText(pmBuy)).toBe("1.351");
  });

  it("live odds matches live clob price", () => {
    expect(pmOddsTextFromClobPrice(0.9)).toBe("1.111");
    expect(pmOddsTextFromClobPrice(0.64)).toBe("1.562");
  });

  it("derives clob price from fo odds when clobPrice missing", () => {
    expect(clobPriceFromFoOddsEntry({ odds: 1.639 })).toBeCloseTo(0.61, 3);
    expect(clobPriceFromFoOddsEntry({ clobPrice: 0.55, odds: 2 })).toBe(0.55);
    expect(clobPriceFromFoOddsEntry(undefined)).toBeNull();
  });

  it("converts sport decimal odds to clob price", () => {
    expect(clobPriceFromDecimalOdds(2)).toBe(0.5);
    expect(clobPriceFromDecimalOdds(1)).toBeNull();
  });

  it("formats API decimals without trailing zeros", () => {
    expect(formatPolymarketApiDecimal(0.68, 6)).toBe("0.68");
    expect(formatPolymarketApiDecimal(7.352941, 6)).toBe("7.352941");
  });
});
