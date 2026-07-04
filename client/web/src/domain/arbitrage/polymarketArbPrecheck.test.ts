import { describe, expect, it, vi } from "vitest";
import { BetOption } from "@/models/betOption";
import { PlatformAccount } from "@/models/platformAccount";
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
    const config = { ...createDefaultUserConfig(), profit: 1.03, maxProfit: 1.2, betMoney: 80 };
    const legA = leg("RAY", 1.36, 80);
    const legB = leg("Polymarket", 5, 20);
    const accountA = new PlatformAccount({ accountId: 1, provider: "RAY", playerName: "ray" });
    const accountB = new PlatformAccount({ accountId: 2, provider: "Polymarket", playerName: "pm" });

    const checkBetting = vi.fn(async (_acc, option: BetOption) => {
      option.data = { apiBetMoney: 5, detectionOdds: 5 };
      return option;
    });

    const result = await reconcilePolymarketArbStakes({
      legA,
      legB,
      accountA,
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
    const accountB = new PlatformAccount({ accountId: 2, provider: "Polymarket", playerName: "pm" });

    const checkBetting = vi.fn(async (_acc, option: BetOption) => {
      option.data = null;
      option.checkError = "盘口价高于检测价";
      return option;
    });

    const result = await reconcilePolymarketArbStakes({
      legA,
      legB,
      accountB,
      config,
      checkBetting,
    });

    expect(result.ok).toBe(false);
    if (result.ok)
      return;
    expect(result.message).toContain("盘口价高于检测价");
  });

  it("hedges RAY in CNY when PM betMoney is USDT after checkBet", async () => {
    const config = {
      ...createDefaultUserConfig(),
      profit: 1.0,
      maxProfit: 1.2,
      tenNumber: true,
    };
    const legA = leg("RAY", 2.63, 10);
    const legB = leg("Polymarket", 1.695, 14);
    const accountA = new PlatformAccount({ accountId: 1, provider: "RAY", playerName: "nip" });
    const accountB = new PlatformAccount({
      accountId: 2,
      provider: "Polymarket",
      playerName: "pm",
      currency: "USDT",
    });

    const checkBetting = vi.fn(async (_acc, option: BetOption) => {
      option.data = { apiBetMoney: option.betMoney, detectionOdds: option.odds };
      return option;
    });

    const result = await reconcilePolymarketArbStakes({
      legA,
      legB,
      accountA,
      accountB,
      config,
      checkBetting,
    });

    expect(result.ok).toBe(true);
    if (!result.ok)
      return;
    expect(result.legB.betMoney).toBe(14);
    expect(result.legA.betMoney).toBe(60);
    expect(checkBetting).toHaveBeenCalledOnce();
    expect(checkBetting.mock.calls[0]?.[1]).toBe(legA);
  });

  it("re-hedges PM from config.betMoney when RAY is low-odds primary", async () => {
    const config = {
      ...createDefaultUserConfig(),
      betMoney: 36,
      profit: 1.0,
      maxProfit: 1.2,
    };
    const legA = leg("RAY", 1.72, 18);
    const legB = leg("Polymarket", 2.632, 14);
    const accountA = new PlatformAccount({
      accountId: 1,
      provider: "RAY",
      playerName: "nip",
      rateConfig: [{ minOdds: 0, maxOdds: 0, rate: 0.5 }],
    });
    const accountB = new PlatformAccount({
      accountId: 2,
      provider: "Polymarket",
      playerName: "pm",
      currency: "USDT",
    });
    legB.data = { apiBetMoney: 14, detectionOdds: 2.631 };

    const checkBetting = vi.fn(async (acc: PlatformAccount, option: BetOption) => {
      option.betMoney = acc.getBetMoney(option.betMoney, option.odds);
      option.data = { apiBetMoney: option.betMoney, detectionOdds: option.odds };
      return option;
    });

    const result = await reconcilePolymarketArbStakes({
      legA,
      legB,
      accountA,
      accountB,
      config,
      checkBetting,
    });

    expect(result.ok).toBe(true);
    if (!result.ok)
      return;
    expect(result.legA.betMoney).toBe(18);
    expect(result.legB.betMoney).toBe(3);
    expect(checkBetting).toHaveBeenCalledOnce();
    expect(checkBetting.mock.calls[0]?.[1]).toBe(legB);
    expect((result.legB.data as { apiBetMoney?: number })?.apiBetMoney).toBe(3);
  });

  it("restores CNY plan before RAY recheck when account has rate", async () => {
    const config = {
      ...createDefaultUserConfig(),
      profit: 1.0,
      maxProfit: 1.2,
      tenNumber: true,
    };
    const legA = leg("RAY", 2.63, 10);
    const legB = leg("Polymarket", 1.695, 14);
    const accountA = new PlatformAccount({
      accountId: 1,
      provider: "RAY",
      playerName: "nip",
      rateConfig: [{ minOdds: 0, maxOdds: 0, rate: 0.5 }],
    });
    const accountB = new PlatformAccount({
      accountId: 2,
      provider: "Polymarket",
      playerName: "pm",
      currency: "USDT",
    });

    const checkBetting = vi.fn(async (acc: PlatformAccount, option: BetOption) => {
      option.betMoney = acc.getBetMoney(option.betMoney, option.odds);
      option.data = { apiBetMoney: option.betMoney, detectionOdds: option.odds };
      return option;
    });

    const result = await reconcilePolymarketArbStakes({
      legA,
      legB,
      accountA,
      accountB,
      config,
      checkBetting,
    });

    expect(result.ok).toBe(true);
    if (!result.ok)
      return;
    expect(result.legA.betMoney).toBe(30);
    expect(result.legB.betMoney).toBe(14);
  });

  it("fails when hedge changes but leg account is missing", async () => {
    const config = createDefaultUserConfig();
    const legA = leg("RAY", 1.36, 80);
    const legB = leg("Polymarket", 5, 20);

    const result = await reconcilePolymarketArbStakes({
      legA,
      legB,
      config,
      checkBetting: vi.fn(),
    });

    expect(result.ok).toBe(false);
    if (result.ok)
      return;
    expect(result.message).toContain("缺少账号");
  });

  it("fails when implied drops below profit without needing stake change", async () => {
    const config = { ...createDefaultUserConfig(), profit: 1.5, maxProfit: 2 };
    const legA = leg("RAY", 1.36, 80);
    const legB = leg("Polymarket", 5, 22);
    const accountA = new PlatformAccount({ accountId: 1, provider: "RAY", playerName: "ray" });
    const accountB = new PlatformAccount({ accountId: 2, provider: "Polymarket", playerName: "pm" });

    const result = await reconcilePolymarketArbStakes({
      legA,
      legB,
      accountA,
      accountB,
      config,
      checkBetting: vi.fn(),
    });

    expect(result.ok).toBe(false);
    if (result.ok)
      return;
    expect(result.message).toContain("未达阈值");
  });
});
