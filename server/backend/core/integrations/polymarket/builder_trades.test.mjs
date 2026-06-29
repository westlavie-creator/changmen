import assert from "node:assert/strict";
import { afterEach, it } from "vitest";
import {
  normalizeBuilderTrade,
  summarizeBuilderTrades,
} from "./builder_trades.js";

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
  assert.equal(row.matchTime, 1700000000_000);
});

it("summarizeBuilderTrades aggregates volume", () => {
  const s = summarizeBuilderTrades([
    { side: "BUY", sizeUsdc: 10, feeUsdc: 0.1 },
    { side: "SELL", sizeUsdc: 5, feeUsdc: 0.05 },
  ]);
  assert.equal(s.tradeCount, 2);
  assert.equal(s.volumeUsdc, 15);
  assert.equal(s.buyCount, 1);
  assert.equal(s.sellCount, 1);
});
