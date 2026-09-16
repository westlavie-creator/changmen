import type { BetOption } from "@changmen/client-core/models/betOption";
import type { PlatformAccount } from "@/models/platformAccount";
import type { ArbBetAttemptParams, ArbBetChecked } from "@/stores/betting/autoBet/phases/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BetOption as BetOptionClass } from "@changmen/client-core/models/betOption";
import { BetResult } from "@changmen/client-core/models/betResult";
import {
  placeArbLegs,
  shouldPlaceLegsInParallel,
} from "@/stores/betting/autoBet/phases/placeArbLegs";
import { createDefaultUserConfig } from "@/types/userConfig";

const betting = vi.hoisted(() => vi.fn());
const checkBetting = vi.hoisted(() => vi.fn());
const retryFailedLeg = vi.hoisted(() => vi.fn());
const syncActiveBetPlaceResults = vi.hoisted(() => vi.fn());
const syncActiveBetPhase = vi.hoisted(() => vi.fn());
const syncActiveBetLeg = vi.hoisted(() => vi.fn());
const getOddsEntry = vi.hoisted(() => vi.fn());

vi.mock("@/stores/accountStore", () => ({
  useAccountStore: () => ({ betting, checkBetting }),
}));

vi.mock("@/stores/oddsStore", () => ({
  useOddsStore: () => ({ getEntry: getOddsEntry }),
}));

vi.mock("@/stores/betting/autoBet/retryFailedLeg", () => ({
  retryFailedLeg,
}));

vi.mock("@/stores/betting/activeBetRunSync", () => ({
  syncActiveBetPlaceResults,
  syncActiveBetPhase,
  syncActiveBetLeg,
  syncActiveBetFail: vi.fn(),
  syncActiveBetPrecheckResults: vi.fn(),
}));

function leg(type: string, target: "Home" | "Away" = "Home"): BetOption {
  return new BetOptionClass(type as never, "m1", "b1", "i1", 100, target, 1.9);
}

function account(provider: string): PlatformAccount {
  return { provider, accountId: provider === "OB" ? 1 : 2, playerName: provider } as PlatformAccount;
}

function checked(overrides: Partial<ArbBetChecked> = {}): ArbBetChecked {
  const legA = overrides.legA ?? leg("OB", "Home");
  const legB = overrides.legB ?? leg("RAY", "Away");
  return {
    implied: 1.05,
    betBothLegs: true,
    singleLegByRate: false,
    linkId: 1_700_000_000_000,
    stakeScale: 1,
    waitSec: 10,
    scanOddsA: Number(legA.odds) || 0,
    scanOddsB: Number(legB.odds) || 0,
    accountA: account("OB"),
    accountB: account("RAY"),
    ...overrides,
    legA,
    legB,
  };
}

const params: ArbBetAttemptParams = {
  match: { id: 1, title: "A vs B", bets: [] } as never,
  bet: { id: 10, getBetName: () => "全场" } as never,
  config: { ...createDefaultUserConfig(), betSorting: "Serial" } as never,
  setMessage: vi.fn(),
};

describe("shouldPlaceLegsInParallel", () => {
  it("A8↔A8 Parallel 仍并发", () => {
    expect(shouldPlaceLegsInParallel("Parallel", "OB", "RAY")).toBe(true);
  });

  it("混合对 Parallel 也不并发", () => {
    expect(shouldPlaceLegsInParallel("Parallel", "Polymarket", "RAY")).toBe(false);
    expect(shouldPlaceLegsInParallel("Parallel", "RAY", "PredictFun")).toBe(false);
  });

  it("非 Parallel 一律顺序", () => {
    expect(shouldPlaceLegsInParallel("Serial", "OB", "RAY")).toBe(false);
  });
});

describe("placeArbLegs two-leg report contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    retryFailedLeg.mockResolvedValue(null);
    getOddsEntry.mockReturnValue(undefined);
    checkBetting.mockImplementation(async (_acc: unknown, option: BetOption) => {
      option.data = option.data ?? { ok: true };
      return option;
    });
  });

  it("顺序 A API 失败：B 为 not_attempted，仍返回 placed（不 abort）", async () => {
    betting.mockResolvedValueOnce(new BetResult("OB", false));

    const out = await placeArbLegs(params, checked());

    expect(betting).toHaveBeenCalledTimes(1);
    expect(out.placeOutcomeA).toBe("api_failed");
    expect(out.placeOutcomeB).toBe("not_attempted");
    expect(out.resultA?.success).toBe(false);
    expect(out.resultB).toBeUndefined();
    expect(syncActiveBetPlaceResults).toHaveBeenCalledWith(
      10,
      expect.anything(),
      undefined,
      true,
      true,
      "api_failed",
      "not_attempted",
    );
  });

  it("并行双腿 API 失败：双 api_failed，仍返回 placed", async () => {
    const parallelParams = {
      ...params,
      config: { ...createDefaultUserConfig(), betSorting: "Parallel" } as never,
    };
    betting
      .mockResolvedValueOnce(new BetResult("OB", false))
      .mockResolvedValueOnce(new BetResult("RAY", false));

    const out = await placeArbLegs(parallelParams, checked());

    expect(betting).toHaveBeenCalledTimes(2);
    expect(out.placeOutcomeA).toBe("api_failed");
    expect(out.placeOutcomeB).toBe("api_failed");
    expect(syncActiveBetPlaceResults).toHaveBeenCalled();
  });

  it("顺序双成功：双 filled_pending_settle", async () => {
    betting
      .mockResolvedValueOnce(new BetResult("OB", true))
      .mockResolvedValueOnce(new BetResult("RAY", true));

    const out = await placeArbLegs(params, checked());

    expect(out.placeOutcomeA).toBe("filled_pending_settle");
    expect(out.placeOutcomeB).toBe("filled_pending_settle");
  });

  it("混合对预检过完后先下即时馆：RAY 失败则 PM 不下", async () => {
    const pmLeg = leg("Polymarket", "Home");
    pmLeg.data = { ok: true };
    const rayLeg = leg("RAY", "Away");
    rayLeg.odds = 2.23;
    betting.mockResolvedValue(new BetResult("RAY", false));

    const out = await placeArbLegs(params, checked({
      legA: pmLeg,
      legB: rayLeg,
      accountA: account("Polymarket"),
      accountB: account("RAY"),
      scanOddsA: 1.9,
      scanOddsB: 2.23,
    }));

    expect(checkBetting).toHaveBeenCalledTimes(1);
    expect(checkBetting).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { skipStakeResolve: true },
    );
    expect((checkBetting.mock.calls[0]![1] as BetOption).odds).toBe(2.23);
    expect(betting).toHaveBeenCalledTimes(1);
    expect((betting.mock.calls[0]![1] as BetOption).type).toBe("RAY");
    expect(out.placeOutcomeA).toBe("not_attempted");
    expect(out.placeOutcomeB).toBe("api_failed");
    expect(out.resultA).toBeUndefined();
  });

  it("混合对：fo 卖一高于检测上限则两侧都不 POST", async () => {
    const pmLeg = leg("Polymarket", "Home");
    pmLeg.itemId = "token-1";
    pmLeg.odds = 5;
    pmLeg.data = { detectionOdds: 5, detectionMaxPrice: 0.2, detectionClobPrice: 0.2 };
    const rayLeg = leg("RAY", "Away");
    rayLeg.odds = 2.23;
    getOddsEntry.mockReturnValue({ clobPrice: 0.32, isLock: false });

    const out = await placeArbLegs(params, checked({
      legA: pmLeg,
      legB: rayLeg,
      accountA: account("Polymarket"),
      accountB: account("RAY"),
      scanOddsA: 5,
      scanOddsB: 2.23,
    }));

    expect(checkBetting).toHaveBeenCalledTimes(1);
    expect(betting).not.toHaveBeenCalled();
    expect(out.placeOutcomeA).toBe("not_attempted");
    expect(out.placeOutcomeB).toBe("not_attempted");
  });

  it("混合对：没有 fo 时仍下即时馆", async () => {
    const pmLeg = leg("Polymarket", "Home");
    pmLeg.data = { detectionOdds: 5, detectionMaxPrice: 0.2, detectionClobPrice: 0.2 };
    const rayLeg = leg("RAY", "Away");
    getOddsEntry.mockReturnValue(undefined);
    betting.mockResolvedValue(new BetResult("RAY", false));

    const out = await placeArbLegs(params, checked({
      legA: pmLeg,
      legB: rayLeg,
      accountA: account("Polymarket"),
      accountB: account("RAY"),
    }));

    expect(betting).toHaveBeenCalledTimes(1);
    expect((betting.mock.calls[0]![1] as BetOption).type).toBe("RAY");
    expect(out.placeOutcomeA).toBe("not_attempted");
    expect(out.placeOutcomeB).toBe("api_failed");
  });

  it("混合对：fo 在上限内仍下即时馆", async () => {
    const pmLeg = leg("Polymarket", "Home");
    pmLeg.odds = 5;
    pmLeg.data = { detectionOdds: 5, detectionMaxPrice: 0.2, detectionClobPrice: 0.2 };
    const rayLeg = leg("RAY", "Away");
    getOddsEntry.mockReturnValue({ clobPrice: 0.2, isLock: false });
    betting.mockResolvedValue(new BetResult("RAY", false));

    await placeArbLegs(params, checked({
      legA: pmLeg,
      legB: rayLeg,
      accountA: account("Polymarket"),
      accountB: account("RAY"),
    }));

    expect(betting).toHaveBeenCalledTimes(1);
    expect((betting.mock.calls[0]![1] as BetOption).type).toBe("RAY");
  });

  it("混合对：fo 已锁盘则两侧都不 POST", async () => {
    const pmLeg = leg("Polymarket", "Home");
    pmLeg.data = { detectionOdds: 5, detectionMaxPrice: 0.2, detectionClobPrice: 0.2 };
    const rayLeg = leg("RAY", "Away");
    getOddsEntry.mockReturnValue({ clobPrice: 0.2, isLock: true });

    const out = await placeArbLegs(params, checked({
      legA: pmLeg,
      legB: rayLeg,
      accountA: account("Polymarket"),
      accountB: account("RAY"),
    }));

    expect(checkBetting).toHaveBeenCalledTimes(1);
    expect(betting).not.toHaveBeenCalled();
    expect(out.placeOutcomeA).toBe("not_attempted");
    expect(out.placeOutcomeB).toBe("not_attempted");
  });

  it("混合对：检测价再预检失败则两侧都不 POST", async () => {
    const pmLeg = leg("Polymarket", "Home");
    pmLeg.data = { ok: true };
    const rayLeg = leg("RAY", "Away");
    rayLeg.odds = 2.12;
    checkBetting.mockImplementation(async (_acc: unknown, option: BetOption) => {
      option.data = null;
      option.checkError = "赔率下降";
      return option;
    });

    const out = await placeArbLegs(params, checked({
      legA: pmLeg,
      legB: rayLeg,
      accountA: account("Polymarket"),
      accountB: account("RAY"),
      scanOddsA: 1.9,
      scanOddsB: 2.23,
    }));

    expect((checkBetting.mock.calls[0]![1] as BetOption).odds).toBe(2.23);
    expect(betting).not.toHaveBeenCalled();
    expect(out.placeOutcomeA).toBe("not_attempted");
    expect(out.placeOutcomeB).toBe("not_attempted");
  });

  it("9999 只下即时馆时仍按检测价再预检，且不改 betMoney 选项", async () => {
    const pmLeg = leg("Polymarket", "Home");
    pmLeg.data = { ok: true };
    const rayLeg = leg("RAY", "Away");
    rayLeg.odds = 2.12;
    rayLeg.betMoney = 55;
    betting.mockResolvedValue(new BetResult("RAY", true));

    const out = await placeArbLegs(params, checked({
      betBothLegs: false,
      singleLegByRate: true,
      accountA: undefined,
      accountB: account("RAY"),
      legA: pmLeg,
      legB: rayLeg,
      scanOddsA: 1.9,
      scanOddsB: 2.23,
    }));

    expect(checkBetting).toHaveBeenCalledTimes(1);
    expect((checkBetting.mock.calls[0]![1] as BetOption).odds).toBe(2.23);
    expect((checkBetting.mock.calls[0]![1] as BetOption).betMoney).toBe(55);
    expect(checkBetting.mock.calls[0]![2]).toEqual({ skipStakeResolve: true });
    expect(betting).toHaveBeenCalledTimes(1);
    expect((betting.mock.calls[0]![1] as BetOption).type).toBe("RAY");
    expect(out.legA.type).toBe("RAY");
    expect(out.placeOutcomeA).toBe("filled_pending_settle");
    expect(out.placeOutcomeB).toBe("not_attempted");
  });

  it("9999 即时馆检测价再预检失败则不下", async () => {
    const pmLeg = leg("Polymarket", "Home");
    pmLeg.data = { ok: true };
    const rayLeg = leg("RAY", "Away");
    checkBetting.mockImplementation(async (_acc: unknown, option: BetOption) => {
      option.data = null;
      option.checkError = "赔率下降";
      return option;
    });

    const out = await placeArbLegs(params, checked({
      betBothLegs: false,
      singleLegByRate: true,
      accountA: undefined,
      accountB: account("RAY"),
      legA: pmLeg,
      legB: rayLeg,
      scanOddsB: 2.23,
    }));

    expect(betting).not.toHaveBeenCalled();
    expect(out.placeOutcomeA).toBe("not_attempted");
    expect(out.placeOutcomeB).toBe("not_attempted");
  });

  it("混合 Parallel 也不并发：RAY 成交且 PM POST 失败时换腿并 retry", async () => {
    const parallelParams = {
      ...params,
      config: { ...createDefaultUserConfig(), betSorting: "Parallel" } as never,
    };
    const pmLeg = leg("Polymarket", "Home");
    pmLeg.data = { ok: true };
    const rayLeg = leg("RAY", "Away");
    rayLeg.data = { ok: 1 };
    let maxConcurrent = 0;
    let concurrent = 0;
    betting.mockImplementation(async (_acc: unknown, option: BetOption) => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise(r => setTimeout(r, 15));
      concurrent--;
      return new BetResult(option.type, option.type === "RAY");
    });

    await placeArbLegs(parallelParams, checked({
      legA: pmLeg,
      legB: rayLeg,
      accountA: account("Polymarket"),
      accountB: account("RAY"),
    }));

    expect(maxConcurrent).toBe(1);
    expect((betting.mock.calls[0]![1] as BetOption).type).toBe("RAY");
    expect((betting.mock.calls[1]![1] as BetOption).type).toBe("Polymarket");
    expect(retryFailedLeg).toHaveBeenCalledTimes(1);
    expect(retryFailedLeg.mock.calls[0]![2].type).toBe("RAY");
    expect(retryFailedLeg.mock.calls[0]![3].type).toBe("Polymarket");
  });

  it("Custom + OB/RAY：仍顺序下单", async () => {
    let concurrent = 0;
    let maxConcurrent = 0;
    betting.mockImplementation(async (_acc: unknown, option: BetOption) => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, 20));
      concurrent--;
      return new BetResult(option.type, true);
    });
    const customParams = {
      ...params,
      config: { ...createDefaultUserConfig(), betSorting: "Custom" } as never,
    };

    await placeArbLegs(customParams, checked());

    expect(betting).toHaveBeenCalledTimes(2);
    expect(maxConcurrent).toBe(1);
  });

  it("非混合对不读这条 fo 闸", async () => {
    getOddsEntry.mockReturnValue({ clobPrice: 0.99 });
    betting.mockResolvedValueOnce(new BetResult("OB", false));

    await placeArbLegs(params, checked());

    expect(getOddsEntry).not.toHaveBeenCalled();
    expect(betting).toHaveBeenCalledTimes(1);
  });
});
