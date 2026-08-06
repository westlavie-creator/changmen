import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { attachPredictFunMarketIds } from "./pf_bet_source.js";

describe("attachPredictFunMarketIds", () => {
  it("projects MarketID onto both Home/AwayMarketID", () => {
    const src = {
      Type: "PredictFun",
      BetID: "cat#m0",
      HomeID: "tok-h",
      AwayID: "tok-a",
    };
    attachPredictFunMarketIds(src, { MarketID: "844582" }, () => "");
    assert.equal(src.HomeMarketID, "844582");
    assert.equal(src.AwayMarketID, "844582");
  });

  it("falls back to per-token lookup when MarketID missing", () => {
    const src = {
      Type: "PredictFun",
      BetID: "legacy",
      HomeID: "tok-h",
      AwayID: "tok-a",
    };
    const lookup = (tok) => (tok === "tok-h" ? "m1" : tok === "tok-a" ? "m2" : "");
    attachPredictFunMarketIds(src, {}, lookup);
    assert.equal(src.HomeMarketID, "m1");
    assert.equal(src.AwayMarketID, "m2");
  });

  it("does not add fields when no MarketID and lookup empty", () => {
    const src = {
      Type: "PredictFun",
      BetID: "x",
      HomeID: "h",
      AwayID: "a",
    };
    attachPredictFunMarketIds(src, {}, () => "");
    assert.equal(src.HomeMarketID, undefined);
    assert.equal(src.AwayMarketID, undefined);
  });
});
