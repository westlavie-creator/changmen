import { describe, expect, it } from "vitest";
import {
  assertPfAvailableBalance,
  balanceAfterStake,
  summarizePfOrders,
} from "./pf_ledger.js";

describe("summarizePfOrders", () => {
  it("empty", () => {
    const r = summarizePfOrders([]);
    expect(r.settledPnl).toBe(0);
    expect(r.openStake).toBe(0);
    expect(r.unsettle).toBe(0);
  });

  it("counts open stake and settled pnl", () => {
    const r = summarizePfOrders([
      { Status: "None", BetMoney: 100, Money: 0 },
      { Status: "Win", BetMoney: 50, Money: 40 },
      { Status: "Lose", BetMoney: 20, Money: -20 },
      { Status: "Reject", BetMoney: 10, Money: 0 },
    ]);
    expect(r.openStake).toBe(100);
    expect(r.unsettle).toBe(1);
    expect(r.settledPnl).toBe(20);
  });

  it("excludes 1:1 sold buys and sell rows from unsettle", () => {
    const r = summarizePfOrders([
      { Status: "None", BetMoney: 100, Money: 15, pfSellState: "closed", pfSide: "buy" },
      { Status: "None", BetMoney: 115, Money: 0, pfSide: "sell", pfBuyOrderId: "b1" },
      { Status: "None", BetMoney: 50, Money: 0, pfSide: "buy", pfSellState: "open" },
    ]);
    expect(r.unsettle).toBe(1);
    expect(r.openStake).toBe(50);
    expect(r.settledPnl).toBe(15);
  });
});

describe("assertPfAvailableBalance", () => {
  it("rejects when stake exceeds balance", () => {
    const r = assertPfAvailableBalance(40, 50);
    expect(r.ok).toBe(false);
    expect(String(r.msg)).toMatch(/不足/);
  });

  it("allows when enough", () => {
    const r = assertPfAvailableBalance(100, 50);
    expect(r.ok).toBe(true);
    expect(r.balance).toBe(100);
  });
});

describe("balanceAfterStake", () => {
  it("deducts stake", () => {
    expect(balanceAfterStake(1000, 10)).toBe(990);
  });
});
