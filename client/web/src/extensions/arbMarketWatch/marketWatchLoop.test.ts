import type { BetRowDto, ClientMatchDto } from "@/types/esport";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runMarketWatchLoopTick } from "@/extensions/arbMarketWatch/marketWatchLoop";
import { ViewBet, ViewMatch } from "@/models/match";
import { createDefaultUserConfig } from "@/types/userConfig";

let foOdds: Record<string, Record<string, number>> = {};

vi.mock("@/stores/oddsStore", () => ({
  useOddsStore: () => ({
    getOdds: (type: string, id: string, fallback: number) =>
      foOdds[type]?.[id] ?? fallback,
  }),
}));

beforeEach(() => {
  foOdds = {};
});

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

function makeMatch(): ViewMatch {
  const bet = new ViewBet(
    {
      ID: 1,
      MatchID: 100,
      HomeID: 1,
      AwayID: 2,
      HomeName: "A",
      AwayName: "B",
      Name: "",
      Map: 1,
      Sources: arbSources,
    },
    { PB: "m1", RAY: "m2" },
    0,
    0,
  );
  const dto: ClientMatchDto = {
    ID: 100,
    Title: "Team A vs Team B",
    Game: "英雄联盟",
    GameID: 1,
    BO: 3,
    StartTime: Date.now(),
    Round: 0,
    RoundStart: 0,
    Reverse: [],
    Matchs: { PB: "m1", RAY: "m2" },
    Bets: [],
  };
  const match = new ViewMatch(dto);
  match.bets = [bet];
  return match;
}

describe("runMarketWatchLoopTick", () => {
  it("returns appeared on first tick when fullMarket arb exists", () => {
    foOdds = {
      PB: { h1: 2.1, a1: 1.5 },
      RAY: { h2: 1.6, a2: 2.2 },
    };
    const config = { ...createDefaultUserConfig(), profit: 1.03, maxProfit: 1.2, minOdds: 1.01 };
    const result = runMarketWatchLoopTick({
      snapshot: new Map(),
      matches: [makeMatch()],
      config,
      actionablePlatforms: ["PB", "RAY"],
    });

    expect(result.transitions).toHaveLength(1);
    expect(result.transitions[0]?.kind).toBe("appeared");
    if (result.transitions[0]?.kind === "appeared") {
      expect(result.transitions[0].opportunity.scope).toBe("fullMarket");
    }
  });

  it("pure tick still emits gone on empty matches (loop layer skips delivery)", () => {
    foOdds = {
      PB: { h1: 2.1, a1: 1.5 },
      RAY: { h2: 1.6, a2: 2.2 },
    };
    const config = { ...createDefaultUserConfig(), profit: 1.03, maxProfit: 1.2, minOdds: 1.01 };
    const first = runMarketWatchLoopTick({
      snapshot: new Map(),
      matches: [makeMatch()],
      config,
      actionablePlatforms: ["PB", "RAY"],
    });
    const second = runMarketWatchLoopTick({
      snapshot: first.snapshot,
      matches: [],
      config,
      actionablePlatforms: ["PB", "RAY"],
    });

    expect(second.transitions[0]?.kind).toBe("gone");
    expect(second.snapshot.size).toBe(0);
  });
});
