import type { BetOption } from "@changmen/client-core/models/betOption";
import { describe, expect, it, vi } from "vitest";
import {
  arbAccountPickerFilter,
  createArbLinkId,
  explainAllowArbRejection,
  explainMissingLegAccount,
  isSingleLegPrecheckOnly,
  legHasSingleLegRateAccount,
  resolveSingleLegCheckAccounts,
} from "@/domain/betting/singleLegRate";
import { PlatformAccount } from "@/models/platformAccount";

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

describe("resolveSingleLegCheckAccounts", () => {
  const matchStore = {
    getBetTarget: () => undefined,
    getDefaultOdds: () => undefined,
  } as never;
  const bet = { id: 1 } as never;
  const match = { game: "英雄联盟", gameId: 1 } as never;
  const legA = makeLeg("PB");
  const legB = makeLeg("RAY");

  it("9999 单边为无下单账号侧补上预检账号", () => {
    const pb9999 = makeAccount({
      accountId: 2,
      provider: "PB",
      rateConfig: [{ minOdds: 0, maxOdds: 0, rate: 9999 }],
    });
    pb9999.balance = 1000;
    const ray = makeAccount({ accountId: 3, provider: "RAY" });
    ray.balance = 1000;

    const { checkAccountA, checkAccountB } = resolveSingleLegCheckAccounts({
      singleLegByRate: true,
      accountA: undefined,
      accountB: ray,
      legA,
      legB,
      bet,
      match,
      accounts: [pb9999, ray],
      excludeA: [],
      excludeB: [],
      matchStore,
      implied: 1.05,
    });

    expect(checkAccountA?.accountId).toBe(2);
    expect(checkAccountB?.accountId).toBe(3);
    expect(isSingleLegPrecheckOnly("A", undefined, ray, checkAccountA, checkAccountB)).toBe(true);
    expect(isSingleLegPrecheckOnly("B", undefined, ray, checkAccountA, checkAccountB)).toBe(false);
  });

  it("关闭 9999 预检时不补 checkAccount", () => {
    const pb9999 = makeAccount({
      accountId: 2,
      provider: "PB",
      rateConfig: [{ minOdds: 0, maxOdds: 0, rate: 9999 }],
    });
    pb9999.balance = 1000;
    const ray = makeAccount({ accountId: 3, provider: "RAY" });
    ray.balance = 1000;

    const { checkAccountA, checkAccountB } = resolveSingleLegCheckAccounts({
      singleLegByRate: true,
      precheck9999Leg: false,
      accountA: undefined,
      accountB: ray,
      legA,
      legB,
      bet,
      match,
      accounts: [pb9999, ray],
      excludeA: [],
      excludeB: [],
      matchStore,
      implied: 1.05,
    });

    expect(checkAccountA).toBeUndefined();
    expect(checkAccountB?.accountId).toBe(3);
  });

  it("非 9999 单边时预检账号等于下单账号", () => {
    const pb = makeAccount({ accountId: 2, provider: "PB" });
    const ray = makeAccount({ accountId: 3, provider: "RAY" });

    const { checkAccountA, checkAccountB } = resolveSingleLegCheckAccounts({
      singleLegByRate: false,
      accountA: pb,
      accountB: ray,
      legA,
      legB,
      bet,
      match,
      accounts: [pb, ray],
      excludeA: [],
      excludeB: [],
      matchStore,
      implied: 1.05,
    });

    expect(checkAccountA).toBe(pb);
    expect(checkAccountB).toBe(ray);
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

  it("带出缺失腿账号的实际过滤原因", () => {
    const acc = makeAccount({ provider: "PB" });
    expect(
      explainAllowArbRejection({
        betBothLegs: false,
        singleLegByRate: false,
        accountA: acc,
        accountB: undefined,
        legA,
        legB,
        missingBReason: "ray-a: 赔率 1.8 不在账号区间 2~99",
      }),
    ).toContain("ray-a: 赔率 1.8 不在账号区间 2~99");
  });
});

describe("explainMissingLegAccount", () => {
  const matchStore = {
    getBetTarget: () => undefined,
    getDefaultOdds: () => undefined,
  } as never;
  const bet = { id: 1 } as never;
  const match = { game: "英雄联盟", gameId: 1 } as never;

  it("说明账号被 noSameBet 排除", () => {
    const leg = makeLeg("RAY");
    const acc = makeAccount({ accountId: 9, provider: "RAY", playerName: "ray-a" });
    acc.balance = 1000;

    expect(explainMissingLegAccount(leg, bet, match, [acc], [9], matchStore)).toContain(
      "ray-a: noSameBet 已排除",
    );
  });

  it("说明账号未通过主下注过滤", () => {
    const leg = makeLeg("RAY");
    const acc = makeAccount({
      provider: "RAY",
      playerName: "ray-a",
      minOdds: 2,
    });
    acc.balance = 1000;

    expect(explainMissingLegAccount(leg, bet, match, [acc], [], matchStore)).toContain(
      "赔率 1.8 不在账号区间 2~99",
    );
  });
});
