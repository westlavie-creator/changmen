import { describe, expect, it } from "vitest";
import {
  decideArbEarlyLockSell,
  isArbEarlyLockSellEnabled,
} from "@/extensions/arbBet/arbEarlyLockSell";

describe("decideArbEarlyLockSell", () => {
  const base = {
    enabled: true,
    mode: "pmEdge" as const,
    minExtraProfit: 0,
    lockedProfitCny: 20,
    sellProceedsCny: 80,
    pmCostCny: 50,
    totalCostCny: 100,
  };

  it("pmEdge: sells when PM floating profit >= locked", () => {
    // edge = 80-50 = 30 >= 20
    expect(decideArbEarlyLockSell(base)).toBe(true);
  });

  it("pmEdge: skips when edge below locked + minExtra", () => {
    expect(decideArbEarlyLockSell({
      ...base,
      sellProceedsCny: 65,
      minExtraProfit: 0,
    })).toBe(false); // 15 < 20
    expect(decideArbEarlyLockSell({
      ...base,
      minExtraProfit: 15,
    })).toBe(false); // 30 < 35
  });

  it("pmEdge: skips when locked profit is negative", () => {
    expect(decideArbEarlyLockSell({
      ...base,
      lockedProfitCny: -20,
      sellProceedsCny: 55,
      pmCostCny: 50,
    })).toBe(false);
  });

  it("floor: requires worst-case >= locked + minExtra", () => {
    // worst = 80-100 = -20 < 20 → false
    expect(decideArbEarlyLockSell({ ...base, mode: "floor" })).toBe(false);
    // worst = 130-100 = 30 >= 20 → true
    expect(decideArbEarlyLockSell({
      ...base,
      mode: "floor",
      sellProceedsCny: 130,
    })).toBe(true);
  });

  it("skips when disabled or invalid proceeds", () => {
    expect(decideArbEarlyLockSell({ ...base, enabled: false })).toBe(false);
    expect(decideArbEarlyLockSell({ ...base, sellProceedsCny: 0 })).toBe(false);
  });
});

describe("isArbEarlyLockSellEnabled", () => {
  it("requires explicit true", () => {
    expect(isArbEarlyLockSellEnabled(undefined)).toBe(false);
    expect(isArbEarlyLockSellEnabled({
      enabled: false,
      mode: "pmEdge",
      minExtraProfit: 0,
    })).toBe(false);
    expect(isArbEarlyLockSellEnabled({
      enabled: true,
      mode: "pmEdge",
      minExtraProfit: 0,
    })).toBe(true);
  });
});
