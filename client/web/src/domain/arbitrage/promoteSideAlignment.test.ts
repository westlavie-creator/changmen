import { describe, expect, it, vi, beforeEach } from "vitest";
import { pickArbLegs } from "@/domain/arbitrage/pickArbLegs";
import { ViewBet } from "@/models/match";
import type { BetRowDto } from "@/types/esport";
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

function makeMap3Bet(sources: BetRowDto["Sources"], homeName: string, awayName: string) {
  const row: BetRowDto = {
    ID: 3003,
    MatchID: 100,
    HomeID: 1,
    AwayID: 2,
    HomeName: homeName,
    AwayName: awayName,
    Name: "[地图3]-单局-获胜",
    Map: 3,
    Sources: sources,
  };
  return new ViewBet(row, { OB: "ob1", RAY: "ray1" }, 3, Date.now());
}

/** gb12 修复后：matcher 输出的 Map3 Sources（9z vs FURIA） */
const alignedMap3Sources: BetRowDto["Sources"] = {
  OB: {
    Type: "OB",
    BetID: "ob-map3",
    HomeID: "ob-m3-h-9z",
    AwayID: "ob-m3-a-furia",
    HomeOdds: 2.065,
    AwayOdds: 1.75,
  },
  RAY: {
    Type: "RAY",
    BetID: "ray-final",
    HomeID: "ray-h-9z",
    AwayID: "ray-a-furia",
    HomeOdds: 2.08,
    AwayOdds: 1.85,
  },
};

/** gb12 bug：promote 二次 swap 后 RAY 回到原生主客 */
const buggyMap3Sources: BetRowDto["Sources"] = {
  OB: {
    Type: "OB",
    BetID: "ob-map3",
    HomeID: "ob-m3-h-9z",
    AwayID: "ob-m3-a-furia",
    HomeOdds: 2.065,
    AwayOdds: 1.75,
  },
  RAY: {
    Type: "RAY",
    BetID: "ray-final",
    HomeID: "ray-h-furia",
    AwayID: "ray-a-9z",
    HomeOdds: 1.85,
    AwayOdds: 2.08,
  },
};

describe("pickArbLegs promote side alignment (gb12)", () => {
  const config = {
    ...createDefaultUserConfig(),
    profit: 1.01,
    maxProfit: 1.2,
    minOdds: 1.3,
  };

  it("aligned Map3: Home 腿与 Away 腿不会都选 9z 高赔", () => {
    foOdds = {
      OB: { "ob-m3-h-9z": 2.065, "ob-m3-a-furia": 1.75 },
      RAY: { "ray-h-9z": 2.08, "ray-a-furia": 1.85 },
    };
    const bet = makeMap3Bet(alignedMap3Sources, "9z", "FURIA");
    const legs = pickArbLegs(bet, { ...config, profit: 0.9 }, ["OB", "RAY"]);
    expect(legs).toBeDefined();
    expect(legs!.homeItem.type).toBe("RAY");
    expect(legs!.awayItem.type).toBe("OB");
    expect(legs!.homeOdds).toBeGreaterThan(2);
    expect(legs!.awayOdds).toBeLessThan(2);
    expect(legs!.implied).toBeLessThan(1.01);
  });

  it("buggy Map3: 误报套利（implied>1）且两腿都落在 9z", () => {
    foOdds = {
      OB: { "ob-m3-h-9z": 2.065, "ob-m3-a-furia": 1.75 },
      RAY: { "ray-h-furia": 1.85, "ray-a-9z": 2.08 },
    };
    const bet = makeMap3Bet(buggyMap3Sources, "9z", "FURIA");
    const legs = pickArbLegs(bet, config, ["OB", "RAY"]);
    expect(legs).toBeDefined();
    expect(legs!.homeItem.type).toBe("OB");
    expect(legs!.awayItem.type).toBe("RAY");
    expect(legs!.homeOdds).toBeGreaterThanOrEqual(2.065);
    expect(legs!.awayOdds).toBeGreaterThanOrEqual(2.08);
    expect(legs!.implied).toBeGreaterThan(1.03);
  });
});
