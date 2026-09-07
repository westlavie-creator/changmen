import { describe, expect, it } from "vitest";
import { mergeFootballClientLists } from "@/runtime/footballClientList";
import type { ClientMatchDto } from "@/types/esport";

function dto(partial: Partial<ClientMatchDto>): ClientMatchDto {
  return {
    ID: 1,
    Title: "A vs B",
    Game: "epl",
    GameID: 0,
    StartTime: 1_700_000_000_000,
    Matchs: {},
    Bets: [],
    ...partial,
  } as ClientMatchDto;
}

describe("mergeFootballClientLists", () => {
  it("overlays OB sources onto the same title+hour PM row", () => {
    const pm = dto({
      Matchs: { Polymarket: "pm1" },
      Bets: [{
        ID: 11,
        MatchID: 1,
        Map: 0,
        Name: "全场胜负",
        MarketCode: "moneyline",
        HomeName: "A",
        AwayName: "B",
        HomeID: 1,
        AwayID: 2,
        Sources: { Polymarket: { Type: "Polymarket", BetID: "p", HomeID: "h", AwayID: "a", HomeOdds: 2, AwayOdds: 3, Status: "Normal" } },
      }] as unknown as ClientMatchDto["Bets"],
    });
    const ob = dto({
      ID: 820000001,
      Matchs: { OB: "mid-1" },
      Bets: [{
        ID: 21,
        MatchID: 820000001,
        Map: 0,
        Name: "全场胜负",
        MarketCode: "moneyline",
        HomeName: "A",
        AwayName: "B",
        HomeID: 1,
        AwayID: 2,
        Sources: { OB: { Type: "OB", BetID: "o", HomeID: "oh", AwayID: "oa", HomeOdds: 1.9, AwayOdds: 1.8, Status: "Normal" } },
      }] as unknown as ClientMatchDto["Bets"],
    });
    const merged = mergeFootballClientLists([pm], [ob]);
    expect(merged).toHaveLength(1);
    expect(merged[0].Matchs).toMatchObject({ Polymarket: "pm1", OB: "mid-1" });
    expect(merged[0].Bets?.[0]?.Sources?.OB?.Type).toBe("OB");
  });

  it("drops 大 vs 小 junk titles", () => {
    const junk = dto({ Title: "大 vs 小", Matchs: { OB: "x" } });
    expect(mergeFootballClientLists([], [junk])).toEqual([]);
  });

  it("collapses PM 让球 and 大小 rows with the same title into one match", () => {
    const ah = dto({
      ID: 1,
      Title: "河王FC vs 火鹰FC",
      Matchs: { Polymarket: "pm-ah" },
      Bets: [{
        ID: 11,
        MatchID: 1,
        Map: 0,
        Name: "全场让球",
        MarketCode: "spreads",
        Line: 0.25,
        HomeName: "河王FC",
        AwayName: "火鹰FC",
        HomeID: 1,
        AwayID: 2,
        Sources: { Polymarket: { Type: "Polymarket", BetID: "ah", HomeID: "h", AwayID: "a", HomeOdds: 1.86, AwayOdds: 1.74, Status: "Normal" } },
      }] as unknown as ClientMatchDto["Bets"],
    });
    const ou = dto({
      ID: 2,
      Title: "河王FC vs 火鹰FC",
      Matchs: { Polymarket: "pm-ou" },
      Bets: [{
        ID: 21,
        MatchID: 2,
        Map: 0,
        Name: "全场大小",
        MarketCode: "totals",
        Line: 9.25,
        HomeName: "大",
        AwayName: "小",
        HomeID: 3,
        AwayID: 4,
        Sources: { Polymarket: { Type: "Polymarket", BetID: "ou", HomeID: "o", AwayID: "u", HomeOdds: 2.22, AwayOdds: 1.42, Status: "Normal" } },
      }] as unknown as ClientMatchDto["Bets"],
    });
    const merged = mergeFootballClientLists([ah, ou], []);
    expect(merged).toHaveLength(1);
    expect(merged[0].Bets?.map(b => b.MarketCode).sort()).toEqual(["spreads", "totals"]);
  });
});
