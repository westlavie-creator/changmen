import { describe, expect, it } from "vitest";
import { formatMarketWatchGroup } from "@/extensions/arbMarketWatch/formatMarketWatch";
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

describe("formatMarketWatchGroup", () => {
  it("formats appeared when fullMarket and funded legs match", () => {
    const body = formatMarketWatchGroup({
      kind: "appeared",
      anchor: "100:1",
      matchTitle: "Team A vs Team B",
      betName: "[地图1] 获胜",
      fullMarket: makeOpp("fullMarket"),
      funded: makeOpp("funded"),
    });
    expect(body).toContain("🔶 套利机会");
    expect(body).toContain("账号可下单：是");
  });

  it("formats appeared with different fullMarket and funded legs", () => {
    const body = formatMarketWatchGroup({
      kind: "appeared",
      anchor: "100:1",
      matchTitle: "Team A vs Team B",
      betName: "[地图1] 获胜",
      fullMarket: makeOpp("fullMarket", { awayPlatform: "OB", awayOdds: 2.8, implied: 1.08 }),
      funded: makeOpp("funded"),
    });
    expect(body).toContain("理论最优");
    expect(body).toContain("OB@2.800");
    expect(body).toContain("可执行");
    expect(body).toContain("RAY@2.200");
  });

  it("formats gone opportunity", () => {
    const body = formatMarketWatchGroup({
      kind: "gone",
      anchor: "100:1",
      matchTitle: "Team A vs Team B",
      betName: "[地图1] 获胜",
      fullMarket: makeOpp("fullMarket"),
      funded: makeOpp("funded"),
    });
    expect(body).toContain("⚪ 套利机会结束");
  });
});
