import { describe, expect, it, vi, beforeEach } from "vitest";
import { ViewBet, type ViewMatch } from "@/models/match";
import type { BetRowDto } from "@/types/esport";
import { PlatformAccount } from "@/models/platformAccount";
import { createDefaultUserConfig } from "@/types/userConfig";
import { pickArbLegs } from "@/domain/arbitrage";
import { evaluateArbOrderEligibility } from "@/extensions/arbBet";

let foOdds: Record<string, Record<string, number>> = {};

vi.mock("@/stores/oddsStore", () => ({
  useOddsStore: () => ({
    getOdds: (type: string, id: string, fallback: number) =>
      foOdds[type]?.[id] ?? fallback,
  }),
}));

vi.mock("@/stores/matchStore", () => ({
  useMatchStore: () => ({
    getDefaultOdds: () => 0,
    getBetTarget: () => undefined,
  }),
}));

beforeEach(() => {
  foOdds = {};
});

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

const matchStub = {
  id: 100,
  title: "A vs B",
  game: "英雄联盟",
  gameId: 1,
  bo: 3,
  startAt: 0,
  liveRound: 0,
  liveRoundStart: 0,
  reverse: [],
  providers: { PB: "m1", RAY: "m2" },
  bets: [],
} as ViewMatch;

describe("evaluateArbOrderEligibility", () => {
  it("reports cannot order when only one funded platform", () => {
    foOdds = {
      PB: { h1: 2.1, a1: 1.5 },
      RAY: { h2: 1.6, a2: 2.2 },
    };
    const bet = makeBet({
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
    });
    const config = {
      ...createDefaultUserConfig(),
      betting: true,
      profit: 1.03,
      minOdds: 1.01,
    };
    const displayKeys = ["PB", "RAY"] as const;
    const legs = pickArbLegs(bet, config, [...displayKeys]);
    expect(legs).toBeDefined();

    const rayOnly = [
      Object.assign(
        new PlatformAccount({
          accountId: 1,
          provider: "RAY",
          playerName: "u1",
        }),
        { balance: 500 },
      ),
    ];

    const result = evaluateArbOrderEligibility({
      match: matchStub,
      bet,
      legs: legs!,
      config,
      accounts: rayOnly,
      autoProviderKeys: ["RAY"],
      loseOrderPending: false,
      getBetTarget: () => undefined,
    });

    expect(result.canOrder).toBe(false);
    expect(result.reasons.some((r) => r.includes("PB"))).toBe(true);
  });

  it("reports can order when both legs have eligible accounts", () => {
    foOdds = {
      PB: { h1: 2.1, a1: 1.5 },
      RAY: { h2: 1.6, a2: 2.2 },
    };
    const bet = makeBet({
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
    });
    const config = {
      ...createDefaultUserConfig(),
      betting: true,
      profit: 1.03,
      minOdds: 1.01,
    };
    const legs = pickArbLegs(bet, config, ["PB", "RAY"]);
    const accounts = [
      Object.assign(
        new PlatformAccount({
          accountId: 1,
          provider: "PB",
          playerName: "pb1",
        }),
        { balance: 500 },
      ),
      Object.assign(
        new PlatformAccount({
          accountId: 2,
          provider: "RAY",
          playerName: "ray1",
        }),
        { balance: 500 },
      ),
    ];

    const result = evaluateArbOrderEligibility({
      match: matchStub,
      bet,
      legs: legs!,
      config,
      accounts,
      autoProviderKeys: ["PB", "RAY"],
      loseOrderPending: false,
      getBetTarget: () => undefined,
    });

    expect(result.canOrder).toBe(true);
    expect(result.summary).toBe("可下单");
  });

  it("reports betting switch off", () => {
    foOdds = {
      PB: { h1: 2.1, a1: 1.5 },
      RAY: { h2: 1.6, a2: 2.2 },
    };
    const bet = makeBet({
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
    });
    const config = {
      ...createDefaultUserConfig(),
      betting: false,
      profit: 1.03,
      minOdds: 1.01,
    };
    const legs = pickArbLegs(bet, config, ["PB", "RAY"]);
    const result = evaluateArbOrderEligibility({
      match: matchStub,
      bet,
      legs: legs!,
      config,
      accounts: [],
      autoProviderKeys: [],
      loseOrderPending: false,
      getBetTarget: () => undefined,
    });

    expect(result.canOrder).toBe(false);
    expect(result.reasons.some((r) => r.includes("自动投注未开启"))).toBe(true);
  });
});
