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
  pmOrderPriceLabel,
  pmOrderSharesText,
  pmOrderStakeDisplayCny,
  pmBuyLifecycleTagText,
  resolvePmFillPrice,
  resolvePmListDisplayPrice,
  resolvePmOrderListStatusClass,
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

  it("maps closed buy / filled sell status badges away from 待结算", () => {
    expect(resolvePmOrderListStatusClass({
      ...pmBuy,
      PmSellState: "closed",
    })).toBe("PmSold");
    expect(resolvePmOrderListStatusClass({
      ...pmBuy,
      PmSellState: "settled",
    })).toBe("PmSettled");
    expect(resolvePmOrderListStatusClass({
      ...pmBuy,
      PmSellState: "settled",
      Status: "Win",
    })).toBe("Win");
    expect(resolvePmOrderListStatusClass({
      ...pmBuy,
      PmSide: "sell",
      BetMoney: 384,
      Money: 184,
    })).toBe("Win");
    expect(resolvePmOrderListStatusClass({
      ...pmBuy,
      PmSide: "sell",
      BetMoney: 100,
      Money: -20,
    })).toBe("Lose");
    expect(resolvePmOrderListStatusClass({
      ...pmBuy,
      PmSide: "sell",
      BetMoney: 0,
      Money: 0,
    })).toBe("None");
    expect(resolvePmOrderListStatusClass(pmBuy)).toBe("None");
  });

  it("lifecycle tag distinguishes sold vs market settled", () => {
    expect(pmBuyLifecycleTagText({ ...pmBuy, PmSellState: "closed" })).toBe("已卖出");
    expect(pmBuyLifecycleTagText({ ...pmBuy, PmSellState: "partial", PmShares: 10, PmAttributedSellShares: 4 })).toBe("部分卖出");
    expect(pmBuyLifecycleTagText({
      ...pmBuy,
      PmSellState: "partial",
      PmShares: 48.2353,
      PmAttributedSellShares: 48.23,
    })).toBe("已卖出");
    expect(pmBuyLifecycleTagText({ ...pmBuy, PmSellState: "settled" })).toBe("已结算");
    expect(pmBuyLifecycleTagText({
      ...pmBuy,
      PmSellState: "settled",
      PmAttributedSellShares: 10,
    })).toBe("已卖出");
    expect(pmBuyLifecycleTagText(pmBuy)).toBeNull();
  });

  it("shows API fill price and share count without rounding", () => {
    expect(resolvePmFillPrice(pmBuy)).toBe(0.74);
    expect(pmOrderFillPriceText(pmBuy)).toBe("0.74");
    expect(pmOrderSharesText(pmBuy)).toBe("6.756753");
  });

  it("shows remaining shares and stake after partial/closed sell", () => {
    expect(pmOrderSharesText({
      ...pmBuy,
      PmSellState: "partial",
      PmAttributedSellShares: 2,
      PmShares: 6.756753,
      PmStakeUsdc: 3,
    })).toBe("4.7568");
    expect(pmOrderStakeDisplayCny({
      ...pmBuy,
      PmSellState: "closed",
      PmAttributedSellShares: 6.756753,
      PmStakeUsdc: 0,
      BetMoney: 35,
    })).toBe(0);
    expect(pmOrderPriceLabel({ ...pmBuy, PmSide: "sell" })).toBe("卖出价");
    expect(pmOrderPriceLabel(pmBuy)).toBe("买入价");
  });

  it("prefers fo live price for unsettled buys", () => {
    expect(resolvePmListDisplayPrice(pmBuy, 0.61)).toBe(0.61);
    expect(pmOrderDisplayPriceText(pmBuy, 0.61)).toBe("0.61");
  });

  it("keeps fill price after close / sell / official settled; price-win still shows live", () => {
    expect(resolvePmListDisplayPrice({ ...pmBuy, PmSellState: "closed" }, 0.61)).toBe(0.74);
    expect(resolvePmListDisplayPrice({ ...pmBuy, PmSide: "sell" }, 0.61)).toBe(0.74);
    expect(resolvePmListDisplayPrice({ ...pmBuy, Status: "Win", PmSellState: "settled" }, 0.61)).toBe(0.74);
    expect(resolvePmListDisplayPrice({ ...pmBuy, Status: "Win", PmSellState: "open" }, 0.61)).toBe(0.61);
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
