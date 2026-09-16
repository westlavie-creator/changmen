import type { BetOption } from "@changmen/client-core/models/betOption";
import type { PlatformAccount } from "@/models/platformAccount";
import type { ArbBetAttemptParams, ArbBetChecked } from "@/stores/betting/autoBet/phases/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BetOption as BetOptionClass } from "@changmen/client-core/models/betOption";
import { BetResult } from "@changmen/client-core/models/betResult";
import { placeArbLegs } from "@/stores/betting/autoBet/phases/placeArbLegs";
import { createDefaultUserConfig } from "@/types/userConfig";

const betting = vi.hoisted(() => vi.fn());
const retryFailedLeg = vi.hoisted(() => vi.fn());
const syncActiveBetPlaceResults = vi.hoisted(() => vi.fn());
const syncActiveBetPhase = vi.hoisted(() => vi.fn());
const syncActiveBetLeg = vi.hoisted(() => vi.fn());

vi.mock("@/stores/accountStore", () => ({
  useAccountStore: () => ({ betting }),
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
  const legA = leg("OB", "Home");
  const legB = leg("RAY", "Away");
  return {
    legA,
    legB,
    accountA: account("OB"),
    accountB: account("RAY"),
    implied: 1.05,
    betBothLegs: true,
    singleLegByRate: false,
    linkId: 1_700_000_000_000,
    stakeScale: 1,
    waitSec: 10,
    ...overrides,
  };
}

const params: ArbBetAttemptParams = {
  match: { id: 1, title: "A vs B", bets: [] } as never,
  bet: { id: 10, getBetName: () => "全场" } as never,
  config: { ...createDefaultUserConfig(), betSorting: "Serial" } as never,
  setMessage: vi.fn(),
};

describe("placeArbLegs two-leg report contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    retryFailedLeg.mockResolvedValue(null);
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

  it("流水线：RAY POST 早于 PM 预检结束", async () => {
    let resolvePm!: (value: BetOption) => void;
    const pmLeg = leg("Polymarket", "Home");
    const rayLeg = leg("RAY", "Away");
    rayLeg.data = { ok: 1 };
    const pendingCheck = new Promise<BetOption>((resolve) => {
      resolvePm = resolve;
    });
    const order: string[] = [];
    betting.mockImplementation(async (_acc: unknown, option: BetOption) => {
      order.push(option.type);
      return new BetResult(option.type, true);
    });

    const run = placeArbLegs(params, checked({
      legA: pmLeg,
      legB: rayLeg,
      accountA: account("Polymarket"),
      accountB: account("RAY"),
      pendingCheck,
      pendingCheckSide: "A",
    }));

    await vi.waitFor(() => expect(order).toEqual(["RAY"]));
    expect(betting).toHaveBeenCalledTimes(1);
    pmLeg.data = { ok: true };
    resolvePm(pmLeg);
    const out = await run;
    expect(order).toEqual(["RAY", "Polymarket"]);
    expect(out.placeOutcomeA).toBe("filled_pending_settle");
    expect(out.placeOutcomeB).toBe("filled_pending_settle");
  });

  it("流水线：PM 预检失败则 RAY 已下、PM 不 POST", async () => {
    const pmLeg = leg("Polymarket", "Home");
    const rayLeg = leg("RAY", "Away");
    rayLeg.data = { ok: 1 };
    betting.mockImplementation(async (_acc: unknown, option: BetOption) => {
      return new BetResult(option.type, true);
    });

    const out = await placeArbLegs(params, checked({
      legA: pmLeg,
      legB: rayLeg,
      accountA: account("Polymarket"),
      accountB: account("RAY"),
      pendingCheck: Promise.resolve(pmLeg),
      pendingCheckSide: "A",
    }));

    expect(betting).toHaveBeenCalledTimes(1);
    expect((betting.mock.calls[0]![1] as BetOption).type).toBe("RAY");
    expect(out.legA.type).toBe("RAY");
    expect(out.placeOutcomeA).toBe("filled_pending_settle");
    expect(out.placeOutcomeB).toBe("not_attempted");
  });

  it("流水线：即时馆失败则不下 PM", async () => {
    const pmLeg = leg("Polymarket", "Home");
    pmLeg.data = { ok: true };
    const rayLeg = leg("RAY", "Away");
    rayLeg.data = { ok: 1 };
    betting.mockImplementation(async (_acc: unknown, option: BetOption) => {
      return new BetResult(option.type, false);
    });

    const out = await placeArbLegs(params, checked({
      legA: pmLeg,
      legB: rayLeg,
      accountA: account("Polymarket"),
      accountB: account("RAY"),
      pendingCheck: Promise.resolve(pmLeg),
      pendingCheckSide: "A",
    }));

    expect(betting).toHaveBeenCalledTimes(1);
    expect((betting.mock.calls[0]![1] as BetOption).type).toBe("RAY");
    expect(out.placeOutcomeB).toBe("api_failed");
    expect(out.placeOutcomeA).toBe("not_attempted");
  });

  it("流水线：deadline 已过但 PM 预检已完成仍 POST", async () => {
    const pmLeg = leg("Polymarket", "Home");
    pmLeg.data = { ok: true };
    const rayLeg = leg("RAY", "Away");
    rayLeg.data = { ok: 1 };
    betting.mockImplementation(async (_acc: unknown, option: BetOption) => {
      return new BetResult(option.type, true);
    });

    const out = await placeArbLegs(params, checked({
      legA: pmLeg,
      legB: rayLeg,
      accountA: account("Polymarket"),
      accountB: account("RAY"),
      pendingCheck: Promise.resolve(pmLeg),
      pendingCheckSide: "A",
      pendingCheckDeadline: Date.now() - 5_000,
    }));

    expect(betting).toHaveBeenCalledTimes(2);
    expect(out.placeOutcomeA).toBe("filled_pending_settle");
    expect(out.placeOutcomeB).toBe("filled_pending_settle");
  });

  it("流水线：即时馆失败不等挂起的 PM 预检", async () => {
    const pmLeg = leg("Polymarket", "Home");
    const rayLeg = leg("RAY", "Away");
    rayLeg.data = { ok: 1 };
    betting.mockResolvedValue(new BetResult("RAY", false));
    const hang = new Promise<BetOption>(() => {});

    const out = await Promise.race([
      placeArbLegs(params, checked({
        legA: pmLeg,
        legB: rayLeg,
        accountA: account("Polymarket"),
        accountB: account("RAY"),
        pendingCheck: hang,
        pendingCheckSide: "A",
      })),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("hung waiting for pending check")), 80);
      }),
    ]);

    expect(betting).toHaveBeenCalledTimes(1);
    expect(out.placeOutcomeB).toBe("api_failed");
    expect(out.placeOutcomeA).toBe("not_attempted");
  });

  it("流水线：RAY 为 B 且 PM POST 失败时换腿并 retry", async () => {
    const pmLeg = leg("Polymarket", "Home");
    pmLeg.data = { ok: true };
    const rayLeg = leg("RAY", "Away");
    rayLeg.data = { ok: 1 };
    betting.mockImplementation(async (_acc: unknown, option: BetOption) => {
      return new BetResult(option.type, option.type === "RAY");
    });

    await placeArbLegs(params, checked({
      legA: pmLeg,
      legB: rayLeg,
      accountA: account("Polymarket"),
      accountB: account("RAY"),
      pendingCheck: Promise.resolve(pmLeg),
      pendingCheckSide: "A",
    }));

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
});
