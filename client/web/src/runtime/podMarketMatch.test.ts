import { describe, expect, it } from "vitest";
import type { PodDropAlert } from "@/runtime/podAlerts";
import type { PodBoardFixture } from "@/runtime/podFixtureMatch";
import {
  comparePodObQuote,
  formatPodMarketMatch,
  formatPodObQuote,
  matchPodAlertToFtTotals,
  matchPodAlertToMarket,
  podSpreadToBoardHomeLine,
} from "@/runtime/podMarketMatch";

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
    markets: [{
      id: 11,
      marketCode: "totals",
      line: 2.5,
      name: "全场大小 2.5",
      ob: true,
      quoteHome: 1.95,
      quoteAway: 1.85,
      quoteDraw: 0,
    }],
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

describe("podMarketMatch", () => {
  it("matches FT totals over/under on the same line and prefers OB", () => {
    const row = matchPodAlertToFtTotals(alert(), fixture({
      markets: [
        { id: 1, marketCode: "totals", line: 2.5, name: "大小 2.5", ob: false, quoteHome: 1.9, quoteAway: 1.9, quoteDraw: 0 },
        { id: 2, marketCode: "totals", line: 2.5, name: "全场大小 2.5", ob: true, quoteHome: 1.95, quoteAway: 1.85, quoteDraw: 0 },
        { id: 3, marketCode: "totals", line: 2.25, name: "全场大小 2.25", ob: true, quoteHome: 2, quoteAway: 1.8, quoteDraw: 0 },
      ],
    }));
    expect(row.status).toBe("matched");
    expect(row.basis).toBe("guess");
    expect(row.side).toBe("over");
    expect(row.line).toBe(2.5);
    expect(row.ob).toBe(true);
    expect(formatPodMarketMatch(row)).toBe("盘已对上 · 全场大小 2.5 大 · OB");
    expect(formatPodMarketMatch(matchPodAlertToFtTotals(alert({ outcome: "under" }), fixture()))).toMatch(/小/);
  });

  it("does not match a different totals line", () => {
    const row = matchPodAlertToFtTotals(alert({ points: 3 }), fixture());
    expect(row.status).toBe("none");
    expect(formatPodMarketMatch(row)).toBe("盘未对上");
  });

  it("does not use half-time totals for a full-time alert", () => {
    const row = matchPodAlertToFtTotals(alert(), fixture({
      markets: [{ id: 1, marketCode: "ht_totals", line: 2.5, name: "半场大小 2.5", ob: true, quoteHome: 1.9, quoteAway: 1.9, quoteDraw: 0 }],
    }));
    expect(row.status).toBe("none");
  });

  it("skips spreads and HT on the totals-only helper", () => {
    expect(matchPodAlertToFtTotals(alert({ lineType: "spread", market: "AH", outcome: "home", points: -0.5 }), fixture()).status).toBe("skipped");
    expect(matchPodAlertToFtTotals(alert({ period: 1 }), fixture()).status).toBe("skipped");
    expect(formatPodMarketMatch(matchPodAlertToFtTotals(alert({ period: 1 }), fixture()))).toBe("盘暂未对");
  });

  it("rejects corners/bookings even when the line exists", () => {
    const corners = matchPodAlertToFtTotals(alert({ market: "Corners", league: "Corners" }), fixture({
      markets: [{ id: 1, marketCode: "totals", line: 2.5, name: "角球大小 2.5", ob: true, quoteHome: 1.9, quoteAway: 1.9, quoteDraw: 0 }],
    }));
    expect(corners.status).toBe("none");
  });

  it("matches even FT moneyline and flips home/away when the fixture is swapped", () => {
    const board = fixture({
      markets: [
        { id: 1, marketCode: "moneyline", line: -1, name: "让球独赢", ob: true, quoteHome: 1.4, quoteAway: 7, quoteDraw: 4 },
        { id: 2, marketCode: "moneyline", line: null, name: "全场独赢", ob: true, quoteHome: 2.1, quoteAway: 3.4, quoteDraw: 3.2 },
        { id: 3, marketCode: "ht_moneyline", line: null, name: "半场独赢", ob: true, quoteHome: 2, quoteAway: 3, quoteDraw: 3 },
      ],
    });
    const home = matchPodAlertToMarket(alert({
      market: "ML",
      lineType: "moneyline",
      outcome: "home",
      points: null,
    }), board);
    expect(home.status).toBe("matched");
    expect(home.side).toBe("home");
    expect(home.quote).toBe(2.1);
    expect(formatPodMarketMatch(home)).toBe("盘已对上 · 全场独赢 主 · OB");
    const swapped = matchPodAlertToMarket(alert({
      market: "ML",
      lineType: "moneyline",
      outcome: "home",
      points: null,
    }), board, true);
    expect(swapped.quote).toBe(3.4);
    expect(formatPodMarketMatch(swapped)).toMatch(/主客相反/);
    const draw = matchPodAlertToMarket(alert({
      market: "ML",
      lineType: "moneyline",
      outcome: "draw",
      points: null,
    }), board);
    expect(draw.side).toBe("draw");
    expect(draw.quote).toBe(3.2);
  });

  it("does not treat European handicap 1X2 as even moneyline", () => {
    const row = matchPodAlertToMarket(alert({
      market: "ML",
      lineType: "moneyline",
      outcome: "home",
      points: null,
    }), fixture({
      markets: [{ id: 1, marketCode: "moneyline", line: -1, name: "让球独赢", ob: true, quoteHome: 1.4, quoteAway: 7, quoteDraw: 4 }],
    }));
    expect(row.status).toBe("none");
  });

  it("compares the matched OB quote against the ticket floor", () => {
    const hit = matchPodAlertToFtTotals(alert(), fixture());
    expect(formatPodObQuote(comparePodObQuote(hit, 1.924))).toBe("OB 1.95 够");
    expect(formatPodObQuote(comparePodObQuote(hit, 1.96))).toBe("OB 1.95 不够");
    expect(formatPodObQuote(comparePodObQuote(emptyNone(), 1.9))).toBe("OB价 —");
    const pmOnly = matchPodAlertToFtTotals(alert(), fixture({
      markets: [{
        id: 1,
        marketCode: "totals",
        line: 2.5,
        name: "全场大小 2.5",
        ob: false,
        quoteHome: 1.95,
        quoteAway: 1.85,
        quoteDraw: 0,
      }],
    }));
    expect(pmOnly.status).toBe("matched");
    expect(pmOnly.ob).toBe(false);
    expect(formatPodObQuote(comparePodObQuote(pmOnly, 1.9))).toBe("OB价 —");
  });

  it("converts POD alerted-side points onto the OB home-centric line", () => {
    expect(podSpreadToBoardHomeLine("home", -0.5)).toBe(-0.5);
    expect(podSpreadToBoardHomeLine("away", 0.5)).toBe(-0.5);
    expect(podSpreadToBoardHomeLine("away", -0.25)).toBe(0.25);
    expect(podSpreadToBoardHomeLine("home", -0.5, true)).toBe(0.5);
  });

  it("matches FT spreads on the home-centric line and flips when swapped", () => {
    const board = fixture({
      markets: [
        { id: 1, marketCode: "spreads", line: -0.5, name: "全场让球 -0.5", ob: true, quoteHome: 1.92, quoteAway: 1.9, quoteDraw: 0 },
        { id: 2, marketCode: "spreads", line: 0, name: "全场让球 0", ob: true, quoteHome: 1.8, quoteAway: 2.0, quoteDraw: 0 },
        { id: 3, marketCode: "ht_spreads", line: -0.5, name: "半场让球 -0.5", ob: true, quoteHome: 1.7, quoteAway: 2.1, quoteDraw: 0 },
      ],
    });
    const home = matchPodAlertToMarket(alert({
      market: "AH",
      lineType: "spread",
      outcome: "home",
      points: -0.5,
    }), board);
    expect(home.status).toBe("matched");
    expect(home.side).toBe("home");
    expect(home.line).toBe(-0.5);
    expect(home.quote).toBe(1.92);
    expect(formatPodMarketMatch(home)).toBe("盘已对上 · 全场让球 主 -0.5 · OB");
    const away = matchPodAlertToMarket(alert({
      market: "AH",
      lineType: "spread",
      outcome: "away",
      points: 0.5,
    }), board);
    expect(away.status).toBe("matched");
    expect(away.quote).toBe(1.9);
    expect(away.line).toBe(0.5);
    expect(away.boardLine).toBe(-0.5);
    expect(away.boardSide).toBe("away");
    expect(formatPodMarketMatch(away)).toBe("盘已对上 · 全场让球 客 +0.5 · OB");
    const swapped = matchPodAlertToMarket(alert({
      market: "AH",
      lineType: "spread",
      outcome: "home",
      points: -0.5,
    }), fixture({
      markets: [{ id: 1, marketCode: "spreads", line: 0.5, name: "全场让球 +0.5", ob: true, quoteHome: 1.9, quoteAway: 1.92, quoteDraw: 0 }],
    }), true);
    expect(swapped.status).toBe("matched");
    expect(swapped.quote).toBe(1.92);
    expect(swapped.boardLine).toBe(0.5);
    expect(swapped.boardSide).toBe("away");
    expect(formatPodMarketMatch(swapped)).toMatch(/主客相反/);
  });

  it("rejects corner spreads and a different handicap line", () => {
    expect(matchPodAlertToMarket(alert({
      market: "Corners",
      lineType: "spread",
      outcome: "home",
      points: -0.5,
    }), fixture({
      markets: [{ id: 1, marketCode: "spreads", line: -0.5, name: "角球让球 -0.5", ob: true, quoteHome: 1.9, quoteAway: 1.9, quoteDraw: 0 }],
    })).status).toBe("none");
    expect(matchPodAlertToMarket(alert({
      market: "Team Total",
      lineType: "total",
      outcome: "over",
      points: 2.5,
    }), fixture()).status).toBe("skipped");
    expect(matchPodAlertToMarket(alert({
      market: "AH",
      lineType: "spread",
      outcome: "home",
      points: -0.25,
    }), fixture({
      markets: [{ id: 1, marketCode: "spreads", line: -0.5, name: "全场让球 -0.5", ob: true, quoteHome: 1.9, quoteAway: 1.9, quoteDraw: 0 }],
    })).status).toBe("none");
  });

  it("matches HT totals, even moneyline, and spreads on ht_* codes only", () => {
    const board = fixture({
      markets: [
        { id: 1, marketCode: "totals", line: 1.5, name: "全场大小 1.5", ob: true, quoteHome: 1.8, quoteAway: 2.0, quoteDraw: 0 },
        { id: 2, marketCode: "ht_totals", line: 1.5, name: "半场大小 1.5", ob: true, quoteHome: 1.91, quoteAway: 1.89, quoteDraw: 0 },
        { id: 3, marketCode: "ht_moneyline", line: null, name: "半场独赢", ob: true, quoteHome: 2.2, quoteAway: 3.1, quoteDraw: 3.3 },
        { id: 4, marketCode: "ht_spreads", line: -0.25, name: "半场让球 -0.25", ob: true, quoteHome: 1.93, quoteAway: 1.87, quoteDraw: 0 },
      ],
    });
    const ou = matchPodAlertToMarket(alert({ period: 1, points: 1.5 }), board);
    expect(ou.status).toBe("matched");
    expect(ou.marketCode).toBe("ht_totals");
    expect(ou.quote).toBe(1.91);
    expect(formatPodMarketMatch(ou)).toBe("盘已对上 · 半场大小 1.5 大 · OB");
    const ml = matchPodAlertToMarket(alert({
      period: 1,
      market: "ML",
      lineType: "moneyline",
      outcome: "home",
      points: null,
    }), board);
    expect(ml.marketCode).toBe("ht_moneyline");
    expect(formatPodMarketMatch(ml)).toBe("盘已对上 · 半场独赢 主 · OB");
    const ah = matchPodAlertToMarket(alert({
      period: 1,
      market: "AH",
      lineType: "spread",
      outcome: "home",
      points: -0.25,
    }), board);
    expect(ah.marketCode).toBe("ht_spreads");
    expect(formatPodMarketMatch(ah)).toBe("盘已对上 · 半场让球 主 -0.25 · OB");
    expect(matchPodAlertToMarket(alert({ period: 2, points: 1.5 }), board).status).toBe("skipped");
  });

  it("overlays live OB quote and treats a known 0 as locked", () => {
    const board = fixture({
      markets: [{
        id: 1,
        marketCode: "totals",
        line: 2.5,
        name: "全场大小 2.5",
        ob: true,
        quoteHome: 1.95,
        quoteAway: 1.85,
        quoteDraw: 0,
        oidHome: "oid-over",
        oidAway: "oid-under",
      }],
    });
    const odds = new Map<string, number>([["oid-over", 1.88]]);
    const live = {
      get: (_p: string, id: string) => odds.get(id) || 0,
      has: (_p: string, id: string) => odds.has(id),
    };
    const hit = matchPodAlertToFtTotals(alert(), board, live);
    expect(hit.quote).toBe(1.88);
    expect(hit.oid).toBe("oid-over");
    expect(hit.locked).toBe(false);
    expect(formatPodObQuote(comparePodObQuote(hit, 1.85))).toBe("OB 1.88 够");
    odds.set("oid-over", 0);
    const locked = matchPodAlertToFtTotals(alert(), board, live);
    expect(locked.locked).toBe(true);
    expect(formatPodObQuote(comparePodObQuote(locked, 1.85))).toBe("OB 锁盘");
  });

  it("does not match totals/spreads after the live line moves, but still uses HTTP for even ML", () => {
    const board = fixture({
      markets: [
        {
          id: 1,
          marketCode: "totals",
          line: 2.5,
          name: "全场大小 2.5",
          ob: true,
          quoteHome: 1.95,
          quoteAway: 1.85,
          quoteDraw: 0,
          oidHome: "oid-ou",
          oidAway: "oid-ou-u",
        },
        {
          id: 2,
          marketCode: "spreads",
          line: -0.5,
          name: "全场让球 -0.5",
          ob: true,
          quoteHome: 1.92,
          quoteAway: 1.9,
          quoteDraw: 0,
          oidHome: "oid-ah",
          oidAway: "oid-ah-a",
        },
        {
          id: 3,
          marketCode: "moneyline",
          line: null,
          name: "全场独赢",
          ob: true,
          quoteHome: 2.1,
          quoteAway: 3.4,
          quoteDraw: 3.2,
          oidHome: "oid-ml-h",
          oidAway: "oid-ml-a",
          oidDraw: "oid-ml-d",
        },
      ],
    });
    const lines = new Map<string, number>([
      ["oid-ou", 2.75],
      ["oid-ah", -0.25],
      ["oid-ml-h", 0],
    ]);
    const live = {
      get: () => 0,
      has: () => false,
      getLine: (oid: string) => (lines.has(oid) ? lines.get(oid)! : null),
    };
    expect(matchPodAlertToFtTotals(alert(), board, live).status).toBe("none");
    expect(matchPodAlertToMarket(alert({
      market: "AH",
      lineType: "spread",
      outcome: "home",
      points: -0.5,
    }), board, false, live).status).toBe("none");
    const ml = matchPodAlertToMarket(alert({
      market: "ML",
      lineType: "moneyline",
      outcome: "home",
      points: null,
    }), board, false, live);
    expect(ml.status).toBe("matched");
    expect(ml.quote).toBe(2.1);
  });
});

function emptyNone() {
  return matchPodAlertToFtTotals(alert({ points: 9 }), fixture());
}
