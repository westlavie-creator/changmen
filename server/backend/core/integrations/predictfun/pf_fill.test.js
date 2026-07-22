import { describe, expect, it } from "vitest";
import {
  extractBuyFillCostUsdt,
  extractBuyFillShares,
  extractBuyNotionalUsdt,
  computePfNotionalUsdt,
  extractSellFill,
  hasBuyFillCostSignal,
  parsePredictQuantityToWei,
} from "./pf_fill.js";
import { assertPredictMarketTradable } from "./pf_market_guard.js";

describe("pf_fill", () => {
  it("parses wei and decimal quantities", () => {
    expect(parsePredictQuantityToWei("25000000000000000000")).toBe(25000000000000000000n);
    expect(parsePredictQuantityToWei("25.5")).toBe(25500000000000000000n);
    expect(parsePredictQuantityToWei("")).toBe(0n);
  });

  it("computes notional from shares × book price", () => {
    expect(computePfNotionalUsdt({ shares: 44.125, bookPrice: 0.32 })).toBe(14.12);
  });

  it("extracts buy notional from makerAmount (distinct from fill cost)", () => {
    const official = {
      amount: "13.68",
      amountFilled: "44125000000000000000",
      order: {
        side: 0,
        makerAmount: "14120000000000000000",
        takerAmount: "43683750000000000000",
      },
    };
    expect(extractBuyFillCostUsdt(official, 0)).toBe(13.68);
    expect(extractBuyFillCostUsdt(official, 0, { excludeMakerAmount: true })).toBe(13.68);
    expect(extractBuyNotionalUsdt(official, { shares: 44.125, bookPrice: 0.32 })).toBe(14.12);
  });

  it("excludeMakerAmount skips maker fallback for fill cost", () => {
    const official = {
      amountFilled: "44125000000000000000",
      order: {
        side: 0,
        makerAmount: "14120000000000000000",
        takerAmount: "43683750000000000000",
      },
    };
    expect(extractBuyFillCostUsdt(official, 0)).toBe(14.12);
    expect(extractBuyFillCostUsdt(official, 0, { excludeMakerAmount: true })).toBe(0);
    expect(hasBuyFillCostSignal(official)).toBe(false);
    expect(hasBuyFillCostSignal({ ...official, amount: "13.68" })).toBe(true);
    expect(hasBuyFillCostSignal({
      ...official,
      pfExecutedValueWei: "13680000000000000000",
    })).toBe(true);
  });

  it("extracts buy fill shares from amountFilled", () => {
    const r = extractBuyFillShares({
      amountFilled: "10000000000000000000",
      order: { takerAmount: "9000000000000000000" },
    }, "1");
    expect(r.sharesWei).toBe(10000000000000000000n);
    expect(r.shares).toBe(10);
  });

  it("extracts buy fill cost from BUY makerAmount", () => {
    const r = extractBuyFillCostUsdt({
      amountFilled: "10000000000000000000",
      order: {
        side: 0,
        makerAmount: "4000000000000000000",
        takerAmount: "10000000000000000000",
      },
    }, 10);
    expect(r).toBe(4);
  });

  it("extracts buy fill cost from wallet executedValueWei", () => {
    const r = extractBuyFillCostUsdt({
      amountFilled: "10000000000000000000",
      pfExecutedValueWei: "4500000000000000000",
      order: {
        makerAmount: "10000000000000000000",
        takerAmount: "4500000000000000000",
      },
    }, 10);
    expect(r).toBe(4.5);
  });

  it("stub without executedValueWei falls back (does not treat shares as USDT)", () => {
    const r = extractBuyFillCostUsdt({
      amountFilled: "25000000000000000000",
      order: {
        makerAmount: "25000000000000000000",
        // taker / pfExecutedValueWei 缺失：勿把 maker(份额) 当本金
      },
    }, 10);
    expect(r).toBe(10);
  });

  it("stub with takerAmount uses taker as USDT", () => {
    const r = extractBuyFillCostUsdt({
      amountFilled: "25000000000000000000",
      order: {
        makerAmount: "25000000000000000000",
        takerAmount: "9800000000000000000",
      },
    }, 10);
    expect(r).toBe(9.8);
  });

  it("extracts sell proceeds from amount decimal", () => {
    const r = extractSellFill({
      status: "FILLED",
      amount: "13.75",
      amountFilled: "25000000000000000000",
      order: {
        makerAmount: "25000000000000000000",
        takerAmount: "10000000000000000000",
        side: 1,
      },
    }, { fallbackProceedsUsdt: 1, fallbackSharesWei: 1n });
    expect(r.proceedsUsdt).toBe(13.75);
    expect(r.shares).toBe(25);
  });
});

describe("assertPredictMarketTradable", () => {
  it("allows OPEN registered markets", () => {
    expect(assertPredictMarketTradable({ status: "REGISTERED", tradingStatus: "OPEN" }).ok).toBe(true);
  });

  it("rejects CLOSED tradingStatus", () => {
    const r = assertPredictMarketTradable({ status: "REGISTERED", tradingStatus: "CLOSED" });
    expect(r.ok).toBe(false);
    expect(String(r.msg)).toMatch(/CLOSED/);
  });

  it("rejects RESOLVED market status", () => {
    const r = assertPredictMarketTradable({ status: "RESOLVED", tradingStatus: "OPEN" });
    expect(r.ok).toBe(false);
  });
});
