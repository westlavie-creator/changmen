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
  pmOrderProfitDisplayCny,
  pmOrderSharesText,
  pmOrderSideTagText,
  pmOrderStakeDisplayCny,
  pmBuyLifecycleTagText,
  resolvePmFillPrice,
  resolvePmListDisplayPrice,
  resolvePmOrderListStatusClass,
  resolvePmSellProceedsUsdc,
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
      Money: 20,
    })).toBe("Win");
    expect(resolvePmOrderListStatusClass({
      ...pmBuy,
      PmSellState: "closed",
      Money: -5,
    })).toBe("Lose");
    expect(resolvePmOrderListStatusClass({
      ...pmBuy,
      PmSellState: "partial",
      PmShares: 10,
      PmAttributedSellShares: 4,
      Money: 3,
    })).toBe("None");
    expect(resolvePmOrderListStatusClass({
      ...pmBuy,
      PmSellState: "settled",
      Money: 12,
    })).toBe("Win");
    expect(resolvePmOrderListStatusClass({
      ...pmBuy,
      PmSellState: "settled",
      Money: -8,
    })).toBe("Lose");
    expect(resolvePmOrderListStatusClass({
      ...pmBuy,
      PmSellState: "settled",
      PmMatchResult: "Lose",
      Money: 0,
    })).toBe("Lose");
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
    })).toBe("PmSell");
    expect(resolvePmOrderListStatusClass({
      ...pmBuy,
      PmSide: "sell",
      BetMoney: 100,
      Money: -20,
    })).toBe("PmSell");
    expect(resolvePmOrderListStatusClass({
      ...pmBuy,
      PmSide: "sell",
      BetMoney: 0,
      Money: 0,
    })).toBe("None");
    expect(resolvePmOrderListStatusClass(pmBuy)).toBe("None");
  });

  it("lifecycle tag distinguishes partial vs market settled; full sell has no 已卖出 tag", () => {
    expect(pmBuyLifecycleTagText({ ...pmBuy, PmSellState: "closed" })).toBeNull();
    expect(pmBuyLifecycleTagText({ ...pmBuy, PmSellState: "partial", PmShares: 10, PmAttributedSellShares: 4 })).toBe("部分卖出");
    expect(pmBuyLifecycleTagText({
      ...pmBuy,
      PmSellState: "partial",
      PmShares: 48.2353,
      PmAttributedSellShares: 48.23,
    })).toBeNull();
    expect(pmBuyLifecycleTagText({ ...pmBuy, PmSellState: "settled" })).toBe("已结算");
    expect(pmBuyLifecycleTagText({
      ...pmBuy,
      PmSellState: "settled",
      PmAttributedSellShares: 10,
    })).toBeNull();
    expect(pmBuyLifecycleTagText(pmBuy)).toBeNull();
  });

  it("shows API fill price and share count without rounding", () => {
    expect(resolvePmFillPrice(pmBuy)).toBe(0.74);
    expect(pmOrderFillPriceText(pmBuy)).toBe("0.74");
    expect(pmOrderSharesText(pmBuy)).toBe("6.756753");
  });

  it("keeps original fill shares and stake on sold buys (order record, not remaining)", () => {
    expect(pmOrderSharesText({
      ...pmBuy,
      PmSellState: "partial",
      PmAttributedSellShares: 2,
      PmShares: 6.756753,
      PmStakeUsdc: 3,
      BetMoney: 20,
    })).toBe("6.756753");
    // 未卖出仍用库内 BetMoney，避免 fill×价四舍五入偏差
    expect(pmOrderStakeDisplayCny(pmBuy)).toBe(35);
    expect(pmOrderSharesText({
      ...pmBuy,
      PmSellState: "closed",
      PmAttributedSellShares: 6.756753,
      PmShares: 6.756753,
      PmStakeUsdc: 0,
      BetMoney: 0,
    })).toBe("6.756753");
    // 6.756753 * 0.74 * 6.8 ≈ 34
    expect(pmOrderStakeDisplayCny({
      ...pmBuy,
      PmSellState: "closed",
      PmAttributedSellShares: 6.756753,
      PmStakeUsdc: 0,
      BetMoney: 0,
    })).toBe(34);
    // 卖出后 BetMoney 保留原始本金（不再缩成剩余）
    expect(pmOrderStakeDisplayCny({
      ...pmBuy,
      PmSellState: "partial",
      PmAttributedSellShares: 2,
      PmStakeUsdc: 3,
      BetMoney: 35,
    })).toBe(35);
    expect(pmOrderPriceLabel({ ...pmBuy, PmSide: "sell" })).toBe("卖单卖出价");
    expect(pmOrderPriceLabel(pmBuy)).toBe("买入价");
    expect(pmOrderSideTagText({ ...pmBuy, PmSide: "sell" })).toBe("卖单");
    expect(pmOrderSideTagText(pmBuy)).toBe("买单");
  });

  it("does not derive fill price from remaining stake after partial sell", () => {
    expect(resolvePmFillPrice({
      ...pmBuy,
      PmFillPrice: undefined,
      PmAttributedSellShares: 2,
      PmShares: 6.756753,
      PmStakeUsdc: 3,
      Odds: 1.351,
    })).toBeCloseTo(1 / 1.351, 5);
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

  it("pmOrderProfitDisplayCny hides sell and falls back to linked sell Money for unsynced buy", () => {
    const buy: OrderRow = {
      ...pmBuy,
      OrderID: "0xbuy",
      Money: 0,
      PmSellState: "closed",
      PmAttributedSellShares: 6.756753,
    };
    const sell: OrderRow = {
      ...pmBuy,
      OrderID: "0xsell",
      PmSide: "sell",
      Money: 65,
      BetMoney: 191,
      PmBuyOrderId: "0xbuy",
    };
    expect(pmOrderProfitDisplayCny(sell, [buy, sell])).toBeNull();
    expect(pmOrderProfitDisplayCny(buy, [buy, sell])).toBe(65);
    expect(pmOrderProfitDisplayCny({ ...buy, Money: 12 }, [buy, sell])).toBe(12);
  });

  it("resolvePmSellProceedsUsdc prefers buy field and falls back to sell BetMoney", () => {
    const buy: OrderRow = {
      ...pmBuy,
      OrderID: "0xbuy",
      PmSellState: "closed",
      PmAttributedSellShares: 6.756753,
      PmSellProceeds: 12.5,
    };
    const sell: OrderRow = {
      ...pmBuy,
      OrderID: "0xsell",
      PmSide: "sell",
      BetMoney: 68,
      Money: 0,
      PmBuyOrderId: "0xbuy",
    };
    expect(resolvePmSellProceedsUsdc(buy, [buy, sell])).toBe(12.5);
    // 侧栏卖单回款展示仍读自身 BetMoney，不因 helper 改变
    expect(pmOrderStakeDisplayCny(sell)).toBe(68);

    const legacyBuy: OrderRow = {
      ...pmBuy,
      OrderID: "0xlegacy",
      PmSellState: "closed",
      PmAttributedSellShares: 10,
    };
    const legacySell: OrderRow = {
      ...pmBuy,
      OrderID: "0xs-legacy",
      PmSide: "sell",
      BetMoney: 68,
      Money: 0,
      PmBuyOrderId: "0xlegacy",
    };
    const fallback = resolvePmSellProceedsUsdc(legacyBuy, [legacyBuy, legacySell]);
    expect(fallback).not.toBeNull();
    expect(fallback!).toBeGreaterThan(0);
    expect(pmOrderStakeDisplayCny(legacySell)).toBe(68);

    // 误写 0 不得挡住卖单兜底
    expect(resolvePmSellProceedsUsdc({
      ...legacyBuy,
      PmSellProceeds: 0,
    }, [legacyBuy, legacySell])).toBe(fallback);
  });
});
