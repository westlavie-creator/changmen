import { describe, expect, it } from "vitest";
import {
  extractBuyFillShares,
  extractSellFill,
  parsePredictQuantityToWei,
} from "./pf_fill.js";
import { assertPredictMarketTradable } from "./pf_market_guard.js";

describe("pf_fill", () => {
  it("parses wei and decimal quantities", () => {
    expect(parsePredictQuantityToWei("25000000000000000000")).toBe(25000000000000000000n);
    expect(parsePredictQuantityToWei("25.5")).toBe(25500000000000000000n);
    expect(parsePredictQuantityToWei("")).toBe(0n);
  });

  it("extracts buy fill shares from amountFilled", () => {
    const r = extractBuyFillShares({
      amountFilled: "10000000000000000000",
      order: { takerAmount: "9000000000000000000" },
    }, "1");
    expect(r.sharesWei).toBe(10000000000000000000n);
    expect(r.shares).toBe(10);
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
