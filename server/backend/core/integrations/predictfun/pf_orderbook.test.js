import { describe, expect, it } from "vitest";
import {
  assertPredictFokBuyDepth,
  bestAskFromPredictBook,
  getPredictComplement,
  isPredictYesOutcomeToken,
  orderbookForOutcomeBuy,
} from "./pf_orderbook.js";

describe("pf_orderbook", () => {
  it("getPredictComplement matches official precision", () => {
    expect(getPredictComplement(0.18, 2)).toBe(0.82);
    expect(getPredictComplement(0.16, 2)).toBe(0.84);
  });

  it("transforms Yes book to No asks", () => {
    const yes = {
      asks: [[0.18, 200], [0.19, 100]],
      bids: [[0.16, 200], [0.15, 50]],
    };
    const no = orderbookForOutcomeBuy(yes, { isYesOutcome: false, decimalPrecision: 2 });
    expect(no.asks).toEqual([[0.84, 200], [0.85, 50]]);
    expect(bestAskFromPredictBook(no)).toBe(0.84);
  });

  it("detects yes/no token by indexSet", () => {
    const outcomes = [
      { name: "BB4", indexSet: 1, onChainId: "tok-yes" },
      { name: "PARI", indexSet: 2, onChainId: "tok-no" },
    ];
    expect(isPredictYesOutcomeToken("tok-yes", outcomes)).toBe(true);
    expect(isPredictYesOutcomeToken("tok-no", outcomes)).toBe(false);
  });
});

describe("assertPredictFokBuyDepth", () => {
  it("passes when top level covers stake", () => {
    expect(() => assertPredictFokBuyDepth([[0.4, 100]], 10)).not.toThrow();
  });

  it("passes when multiple levels cover stake", () => {
    // 0.4*10=4 + 0.45*20=9 → 13 >= 12
    expect(() => assertPredictFokBuyDepth([[0.4, 10], [0.45, 20]], 12)).not.toThrow();
  });

  it("rejects when depth within asks is insufficient", () => {
    // 0.5*10 = 5 USDT only
    expect(() => assertPredictFokBuyDepth([[0.5, 10]], 20)).toThrow(/盘口深度不足/);
  });
});
