import { describe, expect, it } from "vitest";
import { ViewBet, ViewMatch } from "@/models/match";
import { footballMarketTitle, mergeFootballBookRows, viewBetsToMarketRows, applyObLiveOdds } from "@/runtime/footballMarketRows";
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

  it("does not add a second OB moneyline when detail only has draw", () => {
    const merged = mergeFootballBookRows(
      [{
        Name: "全场胜负",
        MarketCode: "moneyline",
        Line: null,
        Venues: [{
          venue: "OB",
          Selections: [
            { Name: "主胜", Side: "home", Odds: 1.94 },
            { Name: "平", Side: "draw", Odds: 3 },
            { Name: "客胜", Side: "away", Odds: 3.7 },
          ],
        }],
      }],
      [{
        Name: "全场独赢",
        MarketCode: "moneyline",
        Line: 0,
        Selections: [
          { Name: "平", Side: "draw", Odds: 5.2 },
        ],
      }],
    );
    expect(merged.filter(r => r.MarketCode === "moneyline")).toHaveLength(1);
    expect(merged[0].Venues).toHaveLength(1);
    expect(merged[0].Venues?.[0]?.Selections?.find(s => s.Side === "home")?.Odds).toBe(1.94);
  });

  it("does not collapse even 1X2 with European handicap lines", () => {
    const merged = mergeFootballBookRows(
      [
        {
          Name: "全场胜负",
          MarketCode: "moneyline",
          Line: null,
          Venues: [{
            venue: "OB",
            Selections: [
              { Name: "主胜", Side: "home", Odds: 2.05 },
              { Name: "平", Side: "draw", Odds: 3.4 },
              { Name: "客胜", Side: "away", Odds: 3.2 },
            ],
          }],
        },
        {
          Name: "全场独赢",
          MarketCode: "moneyline",
          Line: -1,
          Venues: [{
            venue: "OB",
            Selections: [
              { Name: "主胜", Side: "home", Odds: 5.8 },
              { Name: "平", Side: "draw", Odds: 1.2 },
              { Name: "客胜", Side: "away", Odds: 8.1 },
            ],
          }],
        },
      ],
      [],
    );
    expect(merged).toHaveLength(2);
    expect(merged.map(r => r.Line)).toEqual([null, -1]);
  });

  it("applies live OB odds by OddID", () => {
    const live = { get: (_p: string, id: string) => id === "oid-h" ? 1.77 : 0 };
    const rows = applyObLiveOdds(
      [{
        MarketCode: "spreads",
        Selections: [
          { Name: "主", Side: "home", Odds: 1.9, OddID: "oid-h" },
          { Name: "客", Side: "away", Odds: 1.95, OddID: "oid-a" },
        ],
      }],
      live,
    );
    expect(rows[0].Selections?.[0]?.Odds).toBe(1.77);
    expect(rows[0].Selections?.[0]?.Source).toBe("M");
    expect(rows[0].Selections?.[1]?.Odds).toBe(1.95);
    expect(rows[0].Selections?.[1]?.Source).toBe("H");
  });

  it("marks HTTP snapshot as H and WS overlay as M even when price is unchanged", () => {
    const live = {
      get: (_p: string, id: string) => id === "oid-h" ? 1.9 : 0,
      has: (_p: string, id: string) => id === "oid-h",
    };
    const rows = applyObLiveOdds(
      [{
        MarketCode: "spreads",
        Selections: [
          { Name: "主", Side: "home", Odds: 1.9, OddID: "oid-h" },
          { Name: "客", Side: "away", Odds: 1.95, OddID: "oid-a" },
        ],
      }],
      live,
    );
    expect(rows[0].Selections?.[0]?.Source).toBe("M");
    expect(rows[0].Selections?.[1]?.Source).toBe("H");
  });

  it("overlays locked 0 and live line when has/getLine are set", () => {
    const live = {
      get: (_p: string, id: string) => id === "oid-h" ? 0 : 1.91,
      has: (_p: string, id: string) => id === "oid-h" || id === "oid-a",
      getLine: (id: string) => id === "oid-h" ? -0.75 : null,
    };
    const rows = applyObLiveOdds(
      [{
        MarketCode: "spreads",
        Line: -0.5,
        Selections: [
          { Name: "主", Side: "home", Odds: 1.9, OddID: "oid-h" },
          { Name: "客", Side: "away", Odds: 1.95, OddID: "oid-a" },
        ],
      }],
      live,
    );
    expect(rows[0].Line).toBe(-0.75);
    expect(rows[0].Selections?.[0]?.Odds).toBe(0);
    expect(rows[0].Selections?.[0]?.Source).toBe("M");
    expect(rows[0].Selections?.[1]?.Odds).toBe(1.91);
    expect(rows[0].Selections?.[1]?.Source).toBe("M");
  });

  it("tags list-row odds H until sportOddsStore has the oid", () => {
    const match = new ViewMatch(dto());
    for (const bet of match.bets) {
      const src = dto().Bets?.find(b => b.ID === bet.id)?.Sources?.OB;
      for (const item of bet.items) {
        item.fallbackHomeOdds = Number(src?.HomeOdds) || 0;
        item.fallbackAwayOdds = Number(src?.AwayOdds) || 0;
        item.fallbackDrawOdds = Number(src?.DrawOdds) || 0;
      }
    }
    const http = viewBetsToMarketRows(match);
    expect(http.find(r => r.MarketCode === "spreads")?.Venues?.[0]?.Selections?.every(s => s.Source === "H")).toBe(true);
    const live = {
      get: (_p: string, id: string) => id === "h2" ? 1.88 : 0,
      has: (_p: string, id: string) => id === "h2",
    };
    const mixed = viewBetsToMarketRows(match, live);
    const ah = mixed.find(r => r.MarketCode === "spreads")?.Venues?.[0]?.Selections;
    expect(ah?.find(s => s.Side === "home")?.Source).toBe("M");
    expect(ah?.find(s => s.Side === "away")?.Source).toBe("H");
  });
});
