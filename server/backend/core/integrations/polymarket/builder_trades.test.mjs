import assert from "node:assert/strict";
import { it } from "vitest";
import {
  amountToNumber,
  normalizeBuilderTrade,
  summarizeBuilderTrades,
} from "./builder_trades.js";

it("amountToNumber accepts live decimals and docs micro integers", () => {
  assert.equal(amountToNumber("5.88"), 5.88);
  assert.equal(amountToNumber("19.6"), 19.6);
  assert.equal(amountToNumber("0.12348"), 0.12348);
  assert.equal(amountToNumber("50000000"), 50);
  assert.equal(amountToNumber("1000000"), 1);
  assert.equal(amountToNumber("50"), 50);
  assert.equal(amountToNumber(""), 0);
});

it("normalizeBuilderTrade converts micro USDC and match time", () => {
  const row = normalizeBuilderTrade({
    id: "t1",
    side: "BUY",
    size: "1000000",
    sizeUsdc: "500000",
    feeUsdc: "1000",
    price: "0.5",
    matchTime: "1700000000",
    maker: "0x1234567890123456789012345678901234567890",
  });
  assert.equal(row.sizeUsdc, 0.5);
  assert.equal(row.sizeShares, 1);
  assert.equal(row.feeUsdc, 0.001);
  assert.equal(row.displayFeeUsdc, 0.001);
  assert.equal(row.matchTime, 1700000000_000);
});

it("normalizeBuilderTrade keeps live human USDC amounts", () => {
  const row = normalizeBuilderTrade({
    id: "t2",
    side: "BUY",
    size: "19.6",
    sizeUsdc: "5.88",
    feeUsdc: "0.12348",
    builderFee: "0",
    price: "0.3",
    matchTime: "1783594418",
  });
  assert.equal(row.sizeShares, 19.6);
  assert.equal(row.sizeUsdc, 5.88);
  assert.equal(row.feeUsdc, 0.12348);
  assert.equal(row.builderFeeUsdc, 0);
  assert.equal(row.displayFeeUsdc, 0.12348);
});

it("normalizeBuilderTrade prefers builderFee when present", () => {
  const row = normalizeBuilderTrade({
    sizeUsdc: "10",
    feeUsdc: "0.2",
    builderFee: "0.05",
  });
  assert.equal(row.displayFeeUsdc, 0.05);
});

it("summarizeBuilderTrades aggregates volume", () => {
  const s = summarizeBuilderTrades([
    { side: "BUY", sizeUsdc: 10, feeUsdc: 0.1, builderFeeUsdc: 0.05 },
    { side: "SELL", sizeUsdc: 5, feeUsdc: 0.05, builderFeeUsdc: 0 },
  ]);
  assert.equal(s.tradeCount, 2);
  assert.equal(s.volumeUsdc, 15);
  assert.ok(Math.abs(s.feeUsdc - 0.15) < 1e-9);
  assert.ok(Math.abs(s.builderFeeUsdc - 0.05) < 1e-9);
  assert.equal(s.buyCount, 1);
  assert.equal(s.sellCount, 1);
  assert.equal(s.buyVolumeUsdc, 10);
  assert.equal(s.sellVolumeUsdc, 5);
});
