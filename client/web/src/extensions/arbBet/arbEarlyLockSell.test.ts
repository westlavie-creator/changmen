import { describe, expect, it } from "vitest";
import {
  decideArbEarlyLockSell,
  hasOpenBookmakerLeg,
  isArbEarlyLockSellEnabled,
  isDualPredictionArbGroup,
} from "@/extensions/arbBet/arbEarlyLockSell";
import type { OrderRow } from "@/types/order";

describe("decideArbEarlyLockSell", () => {
  const base = {
    enabled: true,
    minExtraProfitPct: 0,
    lockedProfitCny: 20,
    sellBothProceedsCny: 130,
    totalCostCny: 100,
  };

  it("sells when dual-sell net >= locked", () => {
    // net = 130-100 = 30 >= 20
    expect(decideArbEarlyLockSell(base)).toBe(true);
  });

  it("skips when net below locked × (1 + pct/100)", () => {
    expect(decideArbEarlyLockSell({
      ...base,
      sellBothProceedsCny: 115,
    })).toBe(false); // 15 < 20
    // locked 20, +50% → threshold 30; net 30 exact → true
    expect(decideArbEarlyLockSell({
      ...base,
      minExtraProfitPct: 50,
    })).toBe(true);
    // +51% → 30.2; net 30 → false
    expect(decideArbEarlyLockSell({
      ...base,
      minExtraProfitPct: 51,
    })).toBe(false);
  });

  it("skips when locked profit is negative", () => {
    expect(decideArbEarlyLockSell({
      ...base,
      lockedProfitCny: -5,
    })).toBe(false);
  });

  it("skips when disabled or invalid proceeds", () => {
    expect(decideArbEarlyLockSell({ ...base, enabled: false })).toBe(false);
    expect(decideArbEarlyLockSell({ ...base, sellBothProceedsCny: 0 })).toBe(false);
  });
});

describe("isArbEarlyLockSellEnabled", () => {
  it("requires explicit true", () => {
    expect(isArbEarlyLockSellEnabled(undefined)).toBe(false);
    expect(isArbEarlyLockSellEnabled({
      enabled: false,
      mode: "floor",
      minExtraProfitPct: 0,
    })).toBe(false);
    expect(isArbEarlyLockSellEnabled({
      enabled: true,
      mode: "floor",
      minExtraProfitPct: 0,
    })).toBe(true);
  });
});

describe("dual prediction gate", () => {
  function row(patch: Partial<OrderRow>): OrderRow {
    return {
      Status: "None",
      Type: "OB",
      BetMoney: 50,
      ...patch,
    } as OrderRow;
  }

  it("detects open bookmaker legs", () => {
    expect(hasOpenBookmakerLeg([
      row({ Type: "OB" }),
      row({ Type: "Polymarket", PmSide: "buy", PmTokenId: "t", OrderID: "1" }),
    ])).toBe(true);
    expect(hasOpenBookmakerLeg([
      row({ Type: "Polymarket", PmSide: "buy" }),
      row({ Type: "PredictFun", PfSide: "buy" }),
    ])).toBe(false);
  });

  it("isDualPredictionArbGroup requires no book leg (sellability checked at runtime)", () => {
    expect(isDualPredictionArbGroup([
      row({ Type: "OB" }),
      row({ Type: "Polymarket" }),
    ])).toBe(false);
  });

  it("rejects when open prediction legs are not all sellable", () => {
    // 两条 PF 未结，但缺 OrderID → canManualSell 失败 → 不算双边可锁
    expect(isDualPredictionArbGroup([
      row({ Type: "PredictFun", PfSide: "buy", OrderID: "" }),
      row({ Type: "PredictFun", PfSide: "buy", OrderID: "" }),
    ])).toBe(false);
  });
});
