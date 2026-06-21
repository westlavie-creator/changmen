import type { ArbOpportunity } from "@/extensions/arbOpportunity/types";
import { describe, expect, it, vi } from "vitest";
import { buildMarketWatchGroups } from "@/extensions/arbMarketWatch/watchSinks";
import { opportunityKey } from "@/extensions/arbOpportunity/types";
import { createDefaultUserConfig } from "@/types/userConfig";

vi.mock("@/extensions/arbOpportunity/detect", () => ({
  findFundedOpportunityForBet: vi.fn(() => undefined),
}));

function makeOpp(patch: Partial<ArbOpportunity> = {}): ArbOpportunity {
  return {
    scope: "fullMarket",
    matchId: 100,
    betId: 1,
    matchTitle: "A vs B",
    betName: "[地图1] 获胜",
    homePlatform: "PB",
    awayPlatform: "RAY",
    homeOdds: 2.1,
    awayOdds: 2.2,
    implied: 1.05,
    ...patch,
  };
}

const detectParams = {
  matches: [],
  config: createDefaultUserConfig(),
};

describe("buildMarketWatchGroups", () => {
  it("maps appeared transition to appeared group", () => {
    const opp = makeOpp();
    const groups = buildMarketWatchGroups(
      [{ kind: "appeared", opportunity: opp }],
      new Map([[opportunityKey(opp), opp]]),
      detectParams,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]?.kind).toBe("appeared");
    expect(groups[0]?.anchor).toBe("100:1");
  });

  it("maps gone transition when bet has no active opportunity", () => {
    const opp = makeOpp();
    const key = opportunityKey(opp);
    const groups = buildMarketWatchGroups(
      [{ kind: "gone", key, previous: opp }],
      new Map(),
      detectParams,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]?.kind).toBe("gone");
  });

  it("suppresses gone when same bet still has another fullMarket leg", () => {
    const oldOpp = makeOpp({ awayPlatform: "RAY" });
    const newOpp = makeOpp({ awayPlatform: "OB", awayOdds: 2.8, implied: 1.08 });
    const groups = buildMarketWatchGroups(
      [
        {
          kind: "gone",
          key: opportunityKey(oldOpp),
          previous: oldOpp,
        },
      ],
      new Map([[opportunityKey(newOpp), newOpp]]),
      detectParams,
    );
    expect(groups).toEqual([]);
  });
});
