import { describe, expect, it } from "vitest";
import type { PodDropAlert } from "@/runtime/podAlerts";
import type { PodBoardFixture } from "@/runtime/podFixtureMatch";
import { formatPodMarketMatch, matchPodAlertToMarket } from "@/runtime/podMarketMatch";
import { matchPodYaboMarket } from "@/runtime/podYabo/match";

const kick = 1_800_000_000_000;

function fixture(over: Partial<PodBoardFixture> = {}): PodBoardFixture {
  return {
    id: 1,
    title: "Arsenal vs Chelsea",
    game: "英超",
    startAt: kick,
    obMid: "5652292",
    homeName: "Arsenal",
    awayName: "Chelsea",
    markets: [],
    ...over,
  };
}

function alert(over: Partial<PodDropAlert> = {}): PodDropAlert {
  return {
    id: "1",
    eventId: "e",
    sport: "Football",
    sportId: 1,
    league: "England - Premier League",
    home: "Arsenal",
    away: "Chelsea",
    starts: kick,
    alertedAt: kick - 10_000,
    market: "Totals",
    lineType: "total",
    period: 0,
    outcome: "over",
    points: 2.5,
    previous: 2.1,
    current: 1.9,
    nvp: 1.85,
    dropPct: 10,
    ways: null,
    ...over,
  };
}

describe("podYabo/match", () => {
  it("does not score a neighbor totals line against the alert NVP", () => {
    const board = fixture({
      markets: [{
        id: 1,
        marketCode: "totals",
        line: 2.25,
        name: "全场大小 2.25",
        ob: true,
        quoteHome: 2.05,
        quoteAway: 1.75,
        quoteDraw: 0,
        oidHome: "oid-225",
      }],
    });
    expect(matchPodAlertToMarket(alert({ points: 2.5 }), board).status).toBe("none");
    expect(matchPodYaboMarket(alert({ points: 2.5 }), board, false, undefined, { loose: true }).status).toBe("none");
    const books = [{
      eventId: "e",
      period: 0,
      market: "totals" as const,
      line: 2.25,
      nvpHome: 0,
      nvpAway: 0,
      nvpOver: 1.9,
      nvpUnder: 1.95,
    }];
    const loose = matchPodYaboMarket(alert({ points: 2.5 }), board, false, undefined, { loose: true, books });
    expect(loose.status).toBe("matched");
    expect(loose.loose).toBe(true);
    expect(loose.line).toBe(2.25);
    expect(loose.nvp).toBe(1.9);
    expect(formatPodMarketMatch(loose)).toMatch(/副盘/);
  });

  it("matches a neighbor spread only with that line's book NVP", () => {
    const board = fixture({
      markets: [{
        id: 1,
        marketCode: "spreads",
        line: -0.25,
        name: "全场让球 -0.25",
        ob: true,
        quoteHome: 1.88,
        quoteAway: 1.94,
        quoteDraw: 0,
      }],
    });
    const alerted = alert({
      market: "AH",
      lineType: "spread",
      outcome: "home",
      points: -0.5,
    });
    expect(matchPodYaboMarket(alerted, board).status).toBe("none");
    const books = [{
      eventId: "e",
      period: 0,
      market: "spreads" as const,
      line: -0.25,
      nvpHome: 1.87,
      nvpAway: 1.96,
      nvpOver: 0,
      nvpUnder: 0,
    }];
    const loose = matchPodYaboMarket(alerted, board, false, undefined, { loose: true, books });
    expect(loose.status).toBe("matched");
    expect(loose.line).toBe(-0.25);
    expect(loose.nvp).toBe(1.87);
    expect(loose.loose).toBe(true);
  });
});
