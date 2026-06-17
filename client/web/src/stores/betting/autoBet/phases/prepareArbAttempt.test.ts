import { beforeEach, describe, expect, it, vi } from "vitest";
import { ViewBet, type ViewMatch } from "@/models/match";
import type { BetRowDto } from "@/types/esport";
import { createDefaultUserConfig } from "@/types/userConfig";

const loseOrderKeys = vi.hoisted(() => new Set<string>());

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
    hasOrder: (matchId: number, betId: number) =>
      loseOrderKeys.has(`${matchId}:${betId}`),
  }),
}));

vi.mock("@/stores/accountStore", () => ({
  useAccountStore: () => ({
    getProviders: () => new Map([["PB", []], ["RAY", []]]),
    accounts: [],
  }),
}));

import { prepareArbAttempt } from "@/stores/betting/autoBet/phases/prepareArbAttempt";

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
    loseOrderKeys.clear();
    foOdds = {
      PB: { h1: 2.1, a1: 1.5 },
      RAY: { h2: 1.6, a2: 2.2 },
    };
  });

  it("returns null when bet is in lose order queue", async () => {
    loseOrderKeys.add("100:1");
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
