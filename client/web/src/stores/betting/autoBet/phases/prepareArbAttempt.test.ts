import { beforeEach, describe, expect, it, vi } from "vitest";
import { ViewBet, type ViewMatch } from "@/models/match";
import type { BetRowDto } from "@/types/esport";
import { createDefaultUserConfig } from "@/types/userConfig";

const finish = vi.hoisted(() => vi.fn());
const loseOrderIds = vi.hoisted(() => new Set<number>());

let foOdds: Record<string, Record<string, number>> = {};

vi.mock("@/shared/a8Strict", () => ({
  isA8StrictMode: vi.fn(() => false),
}));

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

vi.mock("@/stores/accountStore", () => ({
  useAccountStore: () => ({
    getProviders: () => new Map([["PB", []], ["RAY", []]]),
    accounts: [],
  }),
}));

vi.mock("@/extensions/arbBet/betTrace", () => ({
  createArbFlowTrace: () => ({
    id: "trace",
    event: vi.fn(),
    finish,
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

describe("prepareArbAttempt early skip notify", () => {
  beforeEach(() => {
    finish.mockClear();
    loseOrderIds.clear();
    foOdds = {
      PB: { h1: 2.1, a1: 1.5 },
      RAY: { h2: 1.6, a2: 2.2 },
    };
  });

  it("notifies skip when bet is in lose order queue and arb legs exist", async () => {
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
    expect(finish).toHaveBeenCalledWith(
      "skip",
      "该盘口已在补单队列，自动套利已跳过",
    );
  });

  it("stays silent when no arb legs exist", async () => {
    loseOrderIds.add(1);
    foOdds = {
      PB: { h1: 1.5, a1: 1.5 },
      RAY: { h2: 1.5, a2: 1.5 },
    };
    const bet = makeBet(arbSources);
    const config = { ...createDefaultUserConfig(), profit: 1.03, minOdds: 1.01 };

    await prepareArbAttempt({ match, bet, config, setMessage: () => {} });

    expect(finish).not.toHaveBeenCalled();
  });

  it("notifies skip when order options cannot be built", async () => {
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
    expect(finish).toHaveBeenCalledWith(
      "skip",
      "利润/赔率已不满足阈值，无法构建双腿",
    );
  });
});
