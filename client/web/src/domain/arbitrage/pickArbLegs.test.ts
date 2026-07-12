import "@/test/mockFoOdds";
import { foOddsState } from "@/test/mockFoOdds";
import type { BetRowDto } from "@/types/esport";
import { beforeEach, describe, expect, it } from "vitest";
import { pickArbLegs } from "@changmen/arb-core";
import { ViewBet } from "@/models/match";
import { createDefaultUserConfig } from "@/types/userConfig";

beforeEach(() => {
  foOddsState.current = {};
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
    foOddsState.current = {
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

  it("excludes away leg on same platform as home leg (A8 GetOrderOptions)", () => {
    foOddsState.current = {
      PB: { h1: 2.1, a1: 2.0 },
    };
    const bet = makeBet({
      PB: {
        Type: "PB",
        BetID: "b1",
        HomeID: "h1",
        AwayID: "a1",
        HomeOdds: 2.1,
        AwayOdds: 2.0,
      },
    });
    const config = { ...createDefaultUserConfig(), profit: 1.01, minOdds: 1.01 };
    expect(pickArbLegs(bet, config, ["PB"])).toBeUndefined();
  });

  it("returns undefined when implied below profit", () => {
    foOddsState.current = {
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
