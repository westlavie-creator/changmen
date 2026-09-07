import { describe, expect, it } from "vitest";
import { ViewBet, ViewMatch } from "@/models/match";
import { footballMarketTitle, mergeFootballBookRows, viewBetsToMarketRows } from "@/runtime/footballMarketRows";
import type { ClientMatchDto } from "@/types/esport";

function dto(): ClientMatchDto {
  return {
    ID: 1,
    Title: "A vs B",
    Game: "epl",
    GameID: 0,
    StartTime: Date.now(),
    Matchs: { OB: "99" },
    Bets: [
      {
        ID: 11,
        MatchID: 1,
        Map: 0,
        Name: "全场胜负",
        MarketCode: "moneyline",
        Line: null,
        HomeName: "A",
        AwayName: "B",
        Sources: {
          OB: {
            Type: "OB",
            BetID: "b1",
            HomeID: "h1",
            AwayID: "a1",
            HomeOdds: 2.1,
            AwayOdds: 3.4,
            DrawOdds: 3.2,
            Status: "Normal",
          },
        },
      },
      {
        ID: 12,
        MatchID: 1,
        Map: 0,
        Name: "让球 -0.5",
        MarketCode: "spreads",
        Line: -0.5,
        HomeName: "A",
        AwayName: "B",
        Sources: {
          OB: {
            Type: "OB",
            BetID: "b2",
            HomeID: "h2",
            AwayID: "a2",
            HomeOdds: 1.9,
            AwayOdds: 1.95,
            Status: "Normal",
          },
        },
      },
    ],
  } as unknown as ClientMatchDto;
}

describe("viewBetsToMarketRows", () => {
  it("moneyline is 主胜/平/客胜, not two-way home/away", () => {
    const match = new ViewMatch(dto());
    for (const bet of match.bets) {
      const src = dto().Bets?.find(b => b.ID === bet.id)?.Sources?.OB;
      for (const item of bet.items) {
        item.fallbackHomeOdds = Number(src?.HomeOdds) || 0;
        item.fallbackAwayOdds = Number(src?.AwayOdds) || 0;
        item.fallbackDrawOdds = Number(src?.DrawOdds) || 0;
      }
    }
    const rows = viewBetsToMarketRows(match);
    const ml = rows.find(r => r.MarketCode === "moneyline");
    expect(ml?.Selections?.map(s => s.Name)).toEqual(["主胜", "平", "客胜"]);
    expect(ml?.Selections).toHaveLength(3);
    const ah = rows.find(r => r.MarketCode === "spreads");
    expect(ah?.Selections?.map(s => s.Name)).toEqual(["主", "客"]);
  });

  it("keeps locked list markets so the card is not empty", () => {
    const m = new ViewMatch(dto());
    for (const bet of m.bets) {
      for (const item of bet.items) {
        item.fallbackHomeOdds = 0;
        item.fallbackAwayOdds = 0;
        item.fallbackDrawOdds = 0;
      }
    }
    const rows = viewBetsToMarketRows(m);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every(r => (r.Selections || []).some(s => !(Number(s.Odds) > 0)))).toBe(true);
  });

  it("does not show raw moneyline as the card title", () => {
    expect(footballMarketTitle({ Name: "moneyline", MarketCode: "moneyline" })).toBe("全场胜负");
    expect(footballMarketTitle({ Name: "", MarketCode: "spreads", Line: -0.5 })).toBe("让球 -0.5");
  });

  it("does not construct ViewBet as esport map rows", () => {
    const bet = new ViewBet(dto().Bets![0], { OB: "99" }, 0, 0);
    expect(bet.marketCode).toBe("moneyline");
    expect(bet.getBetName()).not.toMatch(/地图/);
  });

  it("keeps each venue as its own odds row", () => {
    const raw = dto();
    raw.Bets![0].Sources = {
      Polymarket: {
        Type: "Polymarket",
        BetID: "p",
        HomeID: "ph",
        AwayID: "pa",
        HomeOdds: 1.8,
        AwayOdds: 2.2,
        DrawOdds: 3.4,
        Status: "Normal",
      },
      OB: {
        Type: "OB",
        BetID: "b1",
        HomeID: "h1",
        AwayID: "a1",
        HomeOdds: 2.1,
        AwayOdds: 3.4,
        DrawOdds: 3.2,
        Status: "Normal",
      },
    };
    const match = new ViewMatch(raw);
    for (const bet of match.bets) {
      for (const item of bet.items) {
        const src = raw.Bets![0].Sources![item.type];
        item.fallbackHomeOdds = Number(src?.HomeOdds) || 0;
        item.fallbackAwayOdds = Number(src?.AwayOdds) || 0;
        item.fallbackDrawOdds = Number(src?.DrawOdds) || 0;
      }
    }
    const rows = viewBetsToMarketRows(match);
    const ml = rows.find(r => r.MarketCode === "moneyline");
    expect(ml?.Venues?.map(v => v.venue)).toEqual(["Polymarket", "OB"]);
    expect(ml?.Venues?.[0]?.Selections?.find(s => s.Side === "home")?.Odds).toBe(1.8);
    expect(ml?.Venues?.[1]?.Selections?.find(s => s.Side === "home")?.Odds).toBe(2.1);
  });

  it("overlays OB detail onto list venues without dropping Polymarket", () => {
    const merged = mergeFootballBookRows(
      [{
        Name: "让球",
        MarketCode: "spreads",
        Line: -0.5,
        Venues: [{
          venue: "Polymarket",
          Selections: [
            { Name: "主", Side: "home", Odds: 1.9 },
            { Name: "客", Side: "away", Odds: 1.95 },
          ],
        }],
        Selections: [
          { Name: "主", Side: "home", Odds: 1.9 },
          { Name: "客", Side: "away", Odds: 1.95 },
        ],
      }],
      [{
        Name: "全场让球",
        MarketCode: "spreads",
        Line: -0.5,
        hpid: "4",
        Selections: [
          { Name: "主", Side: "home", Odds: 1.85 },
          { Name: "客", Side: "away", Odds: 2.0 },
        ],
      }],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].Venues?.map(v => v.venue)).toEqual(["Polymarket", "OB"]);
    expect(merged[0].Venues?.find(v => v.venue === "OB")?.Selections?.[0]?.Odds).toBe(1.85);
  });
});
