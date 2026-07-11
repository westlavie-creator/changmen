import type { ViewMatch } from "@/models/match";
import type { BetRowDto } from "@/types/esport";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ViewBet } from "@/models/match";
import { prepareArbAttempt } from "@/stores/betting/autoBet/phases/prepareArbAttempt";

import { createDefaultUserConfig } from "@/types/userConfig";

const loseOrderIds = vi.hoisted(() => new Set<number>());

let foOdds: Record<string, Record<string, number>> = {};

vi.mock("@/stores/oddsStore", () => ({
  useOddsStore: () => ({
    getOdds: (type: string, id: string, fallback: number) =>
      foOdds[type]?.[id] ?? fallback,
  }),
}));

vi.mock("@/stores/matchStore", () => ({
  useMatchStore: () => ({
    getBetTarget: () => undefined,
  }),
}));

vi.mock("@/stores/loseOrderStore", () => ({
  useLoseOrderStore: () => ({
    orders: {
      has: (id: number) => loseOrderIds.has(id),
    },
  }),
}));

const extensionPrefs = vi.hoisted(() => ({
  betRowUi: false,
  singleLeg9999Precheck: true,
  singleLeg9999UseValueBetMoney: false,
  stakeScaleByProfit: {
    enabled: false,
    minImplied: 1.05,
    multiplier: 2,
    skipAccountRateOnScale: false,
  },
}));

vi.mock("@/stores/userStore", () => ({
  useUserStore: () => ({
    extensionPrefs,
  }),
}));

vi.mock("@/stores/accountStore", () => ({
  useAccountStore: () => ({
    loaded: true,
    accounts: [
      {
        balance: 1000,
        loadingBalance: false,
        getBalance: () => 1000,
        provider: "PB",
        playerName: "a",
      },
      {
        balance: 1000,
        loadingBalance: false,
        getBalance: () => 1000,
        provider: "RAY",
        playerName: "b",
      },
    ],
    getProviders: () => new Map([["PB", []], ["RAY", []]]),
    getAccount: (provider: string) => ({
      balance: 1000,
      loadingBalance: false,
      getBalance: () => 1000,
      provider,
      playerName: provider === "PB" ? "a" : "b",
    }),
  }),
}));

vi.mock("@/stores/betting/activeBetRunSync", () => ({
  syncActiveBetBegin: vi.fn(),
}));

vi.mock("@/stores/betting/successMarkers", () => ({
  readUsedAccounts: () => [],
}));

function makeBet(sources: BetRowDto["Sources"]) {
  const row: BetRowDto = {
    ID: 1,
    MatchID: 100,
    HomeID: 1,
    AwayID: 2,
    HomeName: "A",
    AwayName: "B",
    Name: "",
    Map: 0,
    Sources: sources,
  };
  return new ViewBet(row, { PB: "m1", RAY: "m2" }, 0, 0);
}

const match = {
  id: 100,
  title: "A vs B",
  game: "英雄联盟",
} as ViewMatch;

const arbSources: BetRowDto["Sources"] = {
  PB: {
    Type: "PB",
    BetID: "b1",
    HomeID: "h1",
    AwayID: "a1",
    HomeOdds: 2.1,
    AwayOdds: 1.5,
  },
  RAY: {
    Type: "RAY",
    BetID: "b2",
    HomeID: "h2",
    AwayID: "a2",
    HomeOdds: 1.6,
    AwayOdds: 2.2,
  },
};

describe("prepareArbAttempt early return (A8 静默 continue)", () => {
  beforeEach(() => {
    loseOrderIds.clear();
    extensionPrefs.stakeScaleByProfit.enabled = false;
    extensionPrefs.stakeScaleByProfit.minImplied = 1.05;
    extensionPrefs.stakeScaleByProfit.multiplier = 2;
    foOdds = {
      PB: { h1: 2.1, a1: 1.5 },
      RAY: { h2: 1.6, a2: 2.2 },
    };
  });

  it("returns null when bet is in lose order queue", async () => {
    loseOrderIds.add(1);
    const bet = makeBet(arbSources);
    const config = { ...createDefaultUserConfig(), profit: 1.03, minOdds: 1.01 };

    const result = await prepareArbAttempt({
      match,
      bet,
      config,
      setMessage: () => {},
    });

    expect(result).toBeNull();
  });

  it("returns null when order options cannot be built", async () => {
    const bet = makeBet(arbSources);
    const config = { ...createDefaultUserConfig(), profit: 1.03, minOdds: 1.01 };
    vi.spyOn(bet, "getOrderOptions").mockReturnValue(undefined);

    const result = await prepareArbAttempt({
      match,
      bet,
      config,
      setMessage: () => {},
    });

    expect(result).toBeNull();
  });

  it("rolls betMoney per bet before getOrderOptions (A8)", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const bet = makeBet(arbSources);
    const config = {
      ...createDefaultUserConfig(),
      profit: 1.03,
      minOdds: 1.01,
      betMoney: 999,
      minMoney: 10,
      maxMoney: 110,
    };
    vi.spyOn(bet, "getOrderOptions").mockReturnValue(undefined);

    await prepareArbAttempt({
      match,
      bet,
      config,
      setMessage: () => {},
    });

    expect(config.betMoney).toBe(60);
  });
});

describe("prepareArbAttempt stakeScaleByProfit [changmen 扩展]", () => {
  beforeEach(() => {
    loseOrderIds.clear();
    extensionPrefs.stakeScaleByProfit.enabled = true;
    extensionPrefs.stakeScaleByProfit.minImplied = 1.05;
    extensionPrefs.stakeScaleByProfit.multiplier = 2;
    foOdds = {
      PB: { h1: 2.1, a1: 1.5 },
      RAY: { h2: 1.6, a2: 2.2 },
    };
  });

  it("scales both leg stakes when implied >= threshold", async () => {
    const bet = makeBet(arbSources);
    const config = { ...createDefaultUserConfig(), profit: 1.01, minOdds: 1.01, betMoney: 100 };
    const legA = { type: "PB", odds: 2.1, betMoney: 100, target: "Home" };
    const legB = { type: "RAY", odds: 2.2, betMoney: 95, target: "Away" };
    // implied ≈ 1/(1/2.1+1/2.2) ≈ 1.074 > 1.05
    vi.spyOn(bet, "getOrderOptions").mockReturnValue([legA, legB] as never);

    const result = await prepareArbAttempt({
      match,
      bet,
      config,
      setMessage: () => {},
    });

    expect(result?.stakeScale).toBe(2);
    expect(legA.betMoney).toBe(200);
    expect(legB.betMoney).toBe(190);
    expect(config.betMoney).toBe(100);
  });
});
