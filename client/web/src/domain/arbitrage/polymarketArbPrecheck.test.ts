import { describe, expect, it, vi } from "vitest";
import { BetOption } from "@/models/betOption";
import type { PlatformAccount } from "@/models/platformAccount";
import {
  arbLegsIncludePolymarket,
  reconcilePolymarketArbStakes,
} from "@/domain/arbitrage/polymarketArbPrecheck";
import { createDefaultUserConfig } from "@/types/userConfig";

function leg(type: string, odds: number, betMoney: number): BetOption {
  return new BetOption(type as never, "m1", "b1", "i1", betMoney, "Home", odds);
}

describe("arbLegsIncludePolymarket", () => {
  it("detects Polymarket on either leg", () => {
    expect(arbLegsIncludePolymarket(leg("RAY", 1.5, 80), leg("Polymarket", 3, 40))).toBe(true);
    expect(arbLegsIncludePolymarket(leg("OB", 1.5, 80), leg("RAY", 2, 40))).toBe(false);
  });
});

describe("reconcilePolymarketArbStakes", () => {
  it("recalculates hedge stake after PM book odds and re-checks PM leg", async () => {
    const config = { ...createDefaultUserConfig(), profit: 1.03, maxProfit: 1.2 };
    const legA = leg("RAY", 1.36, 80);
    const legB = leg("Polymarket", 5, 20);
    const accountB = { provider: "Polymarket" } as PlatformAccount;

    const checkBetting = vi.fn(async (_acc, option: BetOption) => {
      option.data = { apiBetMoney: 5, detectionOdds: 5 };
      return option;
    });

    const result = await reconcilePolymarketArbStakes({
      legA,
      legB,
      accountA: { provider: "RAY" } as PlatformAccount,
      accountB,
      config,
      checkBetting,
    });

    expect(result.ok).toBe(true);
    if (!result.ok)
      return;
    expect(result.legA.betMoney).toBe(80);
    expect(result.legB.betMoney).toBeCloseTo(22, 0);
    expect(checkBetting).toHaveBeenCalledOnce();
    expect(checkBetting.mock.calls[0]?.[1]).toBe(legB);
  });

  it("fails when recheck does not pass", async () => {
    const config = createDefaultUserConfig();
    const legA = leg("RAY", 1.36, 80);
    const legB = leg("Polymarket", 5, 20);

    const checkBetting = vi.fn(async (_acc, option: BetOption) => {
      option.data = null;
      option.checkError = "盘口价高于检测价";
      return option;
    });

    const result = await reconcilePolymarketArbStakes({
      legA,
      legB,
      accountB: { provider: "Polymarket" } as PlatformAccount,
      config,
      checkBetting,
    });

    expect(result.ok).toBe(false);
    if (result.ok)
      return;
    expect(result.message).toContain("盘口价高于检测价");
  });
});
