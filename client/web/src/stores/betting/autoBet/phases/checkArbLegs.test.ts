import type { BetOption } from "@/models/betOption";
import type { PlatformAccount } from "@/models/platformAccount";
import type { ArbBetAttemptParams, ArbBetReady } from "@/stores/betting/autoBet/phases/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BetOption as BetOptionClass } from "@/models/betOption";
import { checkArbLegs } from "@/stores/betting/autoBet/phases/checkArbLegs";
import { createDefaultUserConfig } from "@/types/userConfig";

const checkBetting = vi.hoisted(() => vi.fn());
const reconcilePolymarketArbStakes = vi.hoisted(() => vi.fn());
const getEntry = vi.hoisted(() => vi.fn());

vi.mock("@/stores/accountStore", () => ({
  useAccountStore: () => ({ checkBetting }),
}));

vi.mock("@/stores/oddsStore", () => ({
  useOddsStore: () => ({ getEntry }),
}));

vi.mock("@/domain/arbitrage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/domain/arbitrage")>();
  return {
    ...actual,
    reconcilePolymarketArbStakes,
  };
});

vi.mock("@/shared/wait", () => ({ wait: vi.fn(async () => {}) }));

function leg(type: string, betMoney: number, odds: number, extra: Partial<BetOption> = {}): BetOption {
  const o = new BetOptionClass(type as never, "m1", "b1", "i1", betMoney, "Home", odds);
  return Object.assign(o, extra);
}

function account(provider: string): PlatformAccount {
  return { provider } as PlatformAccount;
}

function ready(legA: BetOption, legB: BetOption): ArbBetReady {
  return {
    legA,
    legB,
    accountA: account(legA.type),
    accountB: account(legB.type),
    implied: 1.05,
    betBothLegs: true,
    singleLegByRate: false,
    linkId: 1_700_000_000_000,
  };
}

const params: ArbBetAttemptParams = {
  match: { id: 1, title: "A vs B", bets: [] } as never,
  bet: { id: 10, getBetName: () => "全场" } as never,
  config: createDefaultUserConfig(),
  setMessage: vi.fn(),
};

describe("checkArbLegs A8 regression", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getEntry.mockReturnValue(undefined);
    checkBetting.mockImplementation(async (_acc, option: BetOption) => {
      option.data = { ok: true };
      return option;
    });
    reconcilePolymarketArbStakes.mockReset();
  });

  it("非 PM 双腿不调用 reconcilePolymarketArbStakes，betMoney 保持 GetOrderOptions 值", async () => {
    const legA = leg("RAY", 80, 1.36);
    const legB = leg("PB", 35, 3.125);

    const out = await checkArbLegs(params, ready(legA, legB));

    expect(out).not.toBeNull();
    expect(reconcilePolymarketArbStakes).not.toHaveBeenCalled();
    expect(out!.legA.betMoney).toBe(80);
    expect(out!.legB.betMoney).toBe(35);
    expect(out!.implied).toBe(1.05);
  });

  it("含 Polymarket 时调用 reconcilePolymarketArbStakes", async () => {
    const legA = leg("RAY", 80, 1.36);
    const legB = leg("Polymarket", 35, 3.125);
    reconcilePolymarketArbStakes.mockResolvedValue({
      ok: true,
      legA,
      legB: { ...legB, betMoney: 22, odds: 5 },
      implied: 1.07,
    });

    const out = await checkArbLegs(params, ready(legA, legB));

    expect(reconcilePolymarketArbStakes).toHaveBeenCalledOnce();
    expect(out!.legB.betMoney).toBe(22);
    expect(out!.implied).toBe(1.07);
  });

  it("pm_sport 系列赛已决出时跳过 PM 腿预检", async () => {
    const legA = leg("RAY", 80, 1.36);
    const legB = leg("Polymarket", 35, 3.125, {
      match: {
        pmSport: {
          mapScore: { home: 1, away: 2 },
          bo: 3,
        },
      } as never,
      bet: { round: 0 } as never,
    });

    const out = await checkArbLegs(params, ready(legA, legB));

    expect(out).toBeNull();
    expect(checkBetting).not.toHaveBeenCalled();
    expect(reconcilePolymarketArbStakes).not.toHaveBeenCalled();
  });
});
