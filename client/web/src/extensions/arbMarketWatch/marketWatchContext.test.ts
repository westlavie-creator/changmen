import type { ArbOpportunity } from "@changmen/arb-core/opportunity/types";
import { describe, expect, it } from "vitest";
import {
  buildMarketWatchContext,
  explainNotExecutable,
} from "@/extensions/arbMarketWatch/marketWatchContext";
import { createDefaultUserConfig } from "@/types/userConfig";

describe("marketWatchContext", () => {
  it("explainNotExecutable lists missing account platforms", () => {
    const fullMarket = {
      homePlatform: "RAY",
      awayPlatform: "OB",
    } as ArbOpportunity;
    const reason = explainNotExecutable(fullMarket, {
      game: "lol",
      homeName: "A",
      awayName: "B",
      startAt: 0,
      bo: 3,
      liveRound: 0,
      betRound: 2,
      isLiveBet: false,
      linkedPlatforms: ["RAY", "IA"],
      platformOdds: [
        { platform: "RAY", homeOdds: 2.1, awayOdds: 1.8, hasAccount: true },
        { platform: "OB", homeOdds: 0, awayOdds: 2.5, hasAccount: false },
      ],
      minProfit: 1.03,
      maxProfit: 1.2,
      minOdds: 1.5,
      bettingEnabled: true,
    });
    expect(reason).toContain("OB(客");
  });

  it("explainNotExecutable prioritizes betting disabled", () => {
    const fullMarket = {
      homePlatform: "OB",
      awayPlatform: "RAY",
    } as ArbOpportunity;
    const reason = explainNotExecutable(fullMarket, {
      game: "王者荣耀",
      homeName: "WST",
      awayName: "济南RW侠",
      startAt: 0,
      bo: 5,
      liveRound: 3,
      betRound: 3,
      isLiveBet: true,
      linkedPlatforms: ["OB", "RAY"],
      platformOdds: [
        { platform: "OB", homeOdds: 2.278, awayOdds: 1.6, hasAccount: false },
        { platform: "RAY", homeOdds: 1.8, awayOdds: 1.94, hasAccount: false },
      ],
      minProfit: 1.03,
      maxProfit: 1.2,
      minOdds: 1.3,
      bettingEnabled: false,
    });
    expect(reason).toBe("未开启投注");
  });
});

describe("buildMarketWatchContext", () => {
  it("returns undefined when match not found", () => {
    const ctx = buildMarketWatchContext(
      { matches: [], config: createDefaultUserConfig() },
      1,
      1,
    );
    expect(ctx).toBeUndefined();
  });
});
