import { describe, expect, it, vi, beforeEach } from "vitest";
import { ViewBet } from "@/models/match";
import type { BetRowDto } from "@/types/esport";
import { createDefaultUserConfig } from "@/types/userConfig";
import { pickArbLegs } from "@/domain/arbitrage";

/** 模拟 fo 缓存；非 HG 平台不再用 Sources 快照作 fallback */
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

describe("pickArbLegs", () => {
  it("returns legs when implied profit meets threshold", () => {
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
    const config = { ...createDefaultUserConfig(), profit: 1.03, maxProfit: 1.2, minOdds: 1.01 };
    const legs = pickArbLegs(bet, config, ["PB", "RAY"]);
    expect(legs).toBeDefined();
    expect(legs!.homeItem.type).toBe("PB");
    expect(legs!.awayItem.type).toBe("RAY");
    expect(legs!.implied).toBeGreaterThan(config.profit);
  });

  it("returns undefined when implied below profit", () => {
    foOdds = {
      PB: { h1: 1.5, a1: 1.5 },
      RAY: { h2: 1.5, a2: 1.5 },
    };
    const bet = makeBet({
      PB: {
        Type: "PB",
        BetID: "b1",
        HomeID: "h1",
        AwayID: "a1",
        HomeOdds: 1.5,
        AwayOdds: 1.5,
      },
      RAY: {
        Type: "RAY",
        BetID: "b2",
        HomeID: "h2",
        AwayID: "a2",
        HomeOdds: 1.5,
        AwayOdds: 1.5,
      },
    });
    const config = { ...createDefaultUserConfig(), profit: 1.03, minOdds: 1.01 };
    expect(pickArbLegs(bet, config, ["PB", "RAY"])).toBeUndefined();
  });
});
