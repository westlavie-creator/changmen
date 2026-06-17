import { describe, expect, it, vi } from "vitest";
import { BetOption } from "@/models/betOption";
import { PlatformAccount } from "@/models/platformAccount";
import {
  arbAccountPickerFilter,
  createArbLinkId,
  explainAllowArbRejection,
  legHasSingleLegRateAccount,
} from "@/extensions/arbBet";

vi.mock("@/stores/matchStore", () => ({
  useMatchStore: () => ({
    getDefaultOdds: () => undefined,
    getBetTarget: () => undefined,
  }),
}));

function makeAccount(patch: Record<string, unknown> = {}) {
  return new PlatformAccount({
    accountId: 1,
    playerName: "test",
    provider: "PB",
    balance: 1000,
    ...patch,
  });
}

function makeLeg(provider: "PB" | "RAY" = "PB"): BetOption {
  return {
    type: provider,
    target: "home",
    odds: 1.8,
    betMoney: 100,
  } as unknown as BetOption;
}

describe("createArbLinkId", () => {
  it("双腿套利为正时间戳", () => {
    const id = createArbLinkId(false);
    expect(id).toBeGreaterThan(0);
  });

  it("比例 9999 单边为负时间戳", () => {
    const id = createArbLinkId(true);
    expect(id).toBeLessThan(0);
  });

  it("复用 GetOrderOptions 时刻时间戳（A8 lBe）", () => {
    const ts = 1_700_000_000_000;
    expect(createArbLinkId(false, ts)).toBe(ts);
    expect(createArbLinkId(true, ts)).toBe(-ts);
  });
});

describe("legHasSingleLegRateAccount", () => {
  const matchStore = {
    getBetTarget: () => undefined,
    getDefaultOdds: () => undefined,
  } as never;

  it("存在比例 9999 单边模式账号时返回 true", () => {
    const leg = makeLeg("PB");
    const acc = makeAccount({
      accountId: 2,
      provider: "PB",
      rateConfig: [{ minOdds: 0, maxOdds: 0, rate: 9999 }],
    });
    acc.balance = 1000;
    expect(
      legHasSingleLegRateAccount(leg, { id: 1 } as never, { game: "英雄联盟", gameId: 1 } as never, [acc], [], matchStore),
    ).toBe(true);
  });

  it("无 9999 账号时返回 false", () => {
    const leg = makeLeg("RAY");
    const acc = makeAccount({ accountId: 3, provider: "RAY" });
    acc.balance = 1000;
    expect(
      legHasSingleLegRateAccount(leg, { id: 1 } as never, { game: "英雄联盟", gameId: 1 } as never, [acc], [], matchStore),
    ).toBe(false);
  });
});

describe("arbAccountPickerFilter", () => {
  const matchStore = { getBetTarget: () => undefined } as never;
  const bet = { id: 1 } as never;
  const match = { game: "英雄联盟", gameId: 1 } as never;
  const leg = makeLeg("PB");

  it("排除比例 9999 单边模式账号", () => {
    const acc = makeAccount({
      rateConfig: [{ minOdds: 0, maxOdds: 0, rate: 9999 }],
    });
    acc.balance = 1000;
    expect(arbAccountPickerFilter(acc, bet, match, leg, matchStore)).toBe(false);
  });
});

describe("explainAllowArbRejection", () => {
  const legA = makeLeg("PB");
  const legB = makeLeg("RAY");

  it("仅一侧有账号且非 9999 单边时说明原因", () => {
    const acc = makeAccount({ provider: "PB" });
    expect(
      explainAllowArbRejection({
        betBothLegs: false,
        singleLegByRate: false,
        accountA: acc,
        accountB: undefined,
        legA,
        legB,
      }),
    ).toContain("仅 PB 有可用账号");
  });
});
