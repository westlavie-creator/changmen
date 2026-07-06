import assert from "node:assert/strict";
import { it } from "vitest";
import {
  Currency,
  getCurrency,
  getExchange,
  scaleUsdtToCnyDisplay,
} from "./currency.js";

it("getExchange mirrors A8 Pr.exchange", () => {
  assert.equal(getExchange(Currency.CNY), 1);
  assert.equal(getExchange(Currency.USDT), 6.8);
  assert.equal(getExchange(undefined), 1);
  assert.equal(getExchange("USDT"), 6.8);
});

it("getCurrency normalizes venue codes like A8 Pr.getCurrency", () => {
  assert.equal(getCurrency("RMB"), Currency.CNY);
  assert.equal(getCurrency("USD"), Currency.USDT);
  assert.equal(getCurrency(undefined), Currency.CNY);
});

it("scaleUsdtToCnyDisplay converts venue USDT to plan CNY", () => {
  assert.equal(scaleUsdtToCnyDisplay(14), 95.2);
  assert.equal(scaleUsdtToCnyDisplay(Number.NaN), 0);
});
