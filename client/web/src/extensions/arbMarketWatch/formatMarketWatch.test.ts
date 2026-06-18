import { describe, expect, it } from "vitest";
import { formatMarketWatchGroup } from "@/extensions/arbMarketWatch/formatMarketWatch";
import type { ArbMarketWatchContext } from "@/extensions/arbMarketWatch/marketWatchContext";
import type { ArbOpportunity } from "@/extensions/arbOpportunity/types";

function makeOpp(scope: "fullMarket" | "funded", patch: Partial<ArbOpportunity> = {}): ArbOpportunity {
  return {
    scope,
    matchId: 100,
    betId: 1,
    matchTitle: "Team A vs Team B",
    betName: "[地图1] 获胜",
    homePlatform: "PB",
    awayPlatform: "RAY",
    homeOdds: 2.1,
    awayOdds: 2.2,
    implied: 1.05,
    ...patch,
  };
}

function makeContext(patch: Partial<ArbMarketWatchContext> = {}): ArbMarketWatchContext {
  return {
    game: "英雄联盟",
    homeName: "New tones",
    awayName: "Luxe Gaming",
    startAt: Date.parse("2026-06-18T14:00:00+08:00"),
    bo: 3,
    liveRound: 2,
    betRound: 2,
    isLiveBet: true,
    linkedPlatforms: ["RAY", "IA", "TF"],
    platformOdds: [
      { platform: "RAY", homeOdds: 2.31, awayOdds: 1.65, hasAccount: true },
      { platform: "IA", homeOdds: 1.52, awayOdds: 1.87, hasAccount: true },
    ],
    minProfit: 1.03,
    maxProfit: 1.2,
    minOdds: 1.5,
    bettingEnabled: true,
    ...patch,
  };
}

describe("formatMarketWatchGroup", () => {
  it("formats appeared when fullMarket and funded legs match", () => {
    const body = formatMarketWatchGroup({
      kind: "appeared",
      anchor: "100:1",
      matchTitle: "Team A vs Team B",
      betName: "[地图1] 获胜",
      fullMarket: makeOpp("fullMarket"),
      funded: makeOpp("funded"),
      context: makeContext(),
    });
    expect(body).toContain("🔶 套利机会");
    expect(body).toContain("[英雄联盟]");
    expect(body).toContain("各平台赔率");
    expect(body).toContain("账号可下单：是");
  });

  it("formats appeared when funded missing with reason", () => {
    const body = formatMarketWatchGroup({
      kind: "appeared",
      anchor: "100:1",
      matchTitle: "Team A vs Team B",
      betName: "[地图2] 获胜",
      fullMarket: makeOpp("fullMarket", {
        homePlatform: "RAY",
        awayPlatform: "IA",
        homeOdds: 2.31,
        awayOdds: 1.87,
        implied: 1.033,
      }),
      context: makeContext({
        platformOdds: [
          { platform: "RAY", homeOdds: 2.31, awayOdds: 1.65, hasAccount: true },
          { platform: "IA", homeOdds: 1.52, awayOdds: 1.87, hasAccount: false },
        ],
      }),
    });
    expect(body).toContain("理论最优");
    expect(body).toContain("RAY@2.310");
    expect(body).toContain("IA@1.870");
    expect(body).toContain("可执行</b>：无");
    expect(body).toContain("原因：");
    expect(body).toContain("IA(客，无可用账号)");
  });

  it("formats appeared when betting disabled even if accounts exist", () => {
    const body = formatMarketWatchGroup({
      kind: "appeared",
      anchor: "214:876547",
      matchTitle: "WST vs 济南RW侠",
      betName: "[地图3] 获胜",
      fullMarket: makeOpp("fullMarket", {
        matchId: 214,
        betId: 876547,
        homePlatform: "OB",
        awayPlatform: "RAY",
        homeOdds: 2.278,
        awayOdds: 1.94,
        implied: 1.048,
      }),
      funded: makeOpp("funded", {
        matchId: 214,
        betId: 876547,
        homePlatform: "OB",
        awayPlatform: "RAY",
        homeOdds: 2.278,
        awayOdds: 1.94,
        implied: 1.048,
      }),
      context: makeContext({
        bettingEnabled: false,
        platformOdds: [
          { platform: "OB", homeOdds: 2.278, awayOdds: 1.6, hasAccount: false },
          { platform: "RAY", homeOdds: 1.8, awayOdds: 1.94, hasAccount: false },
        ],
      }),
    });
    expect(body).toContain("理论最优");
    expect(body).toContain("可执行</b>：无");
    expect(body).toContain("原因：未开启投注");
    expect(body).not.toContain("无可用账号");
    expect(body).not.toContain("账号可下单：是");
  });

  it("formats appeared with different fullMarket and funded legs", () => {
    const body = formatMarketWatchGroup({
      kind: "appeared",
      anchor: "100:1",
      matchTitle: "Team A vs Team B",
      betName: "[地图2] 获胜",
      fullMarket: makeOpp("fullMarket", { awayPlatform: "OB", awayOdds: 2.8, implied: 1.08 }),
      funded: makeOpp("funded"),
      context: makeContext({
        platformOdds: [
          { platform: "RAY", homeOdds: 2.31, awayOdds: 1.65, hasAccount: true },
          { platform: "IA", homeOdds: 1.52, awayOdds: 1.87, hasAccount: false },
          { platform: "OB", homeOdds: 1.9, awayOdds: 2.8, hasAccount: false },
        ],
      }),
    });
    expect(body).toContain("理论最优");
    expect(body).toContain("OB@2.800");
    expect(body).toContain("可执行");
    expect(body).toContain("RAY@2.200");
    expect(body).toContain("门槛：");
  });

  it("formats gone opportunity", () => {
    const body = formatMarketWatchGroup({
      kind: "gone",
      anchor: "100:1",
      matchTitle: "Team A vs Team B",
      betName: "[地图1] 获胜",
      fullMarket: makeOpp("fullMarket"),
      funded: makeOpp("funded"),
      context: makeContext(),
    });
    expect(body).toContain("⚪ 套利机会结束");
    expect(body).toContain("[英雄联盟]");
  });
});
