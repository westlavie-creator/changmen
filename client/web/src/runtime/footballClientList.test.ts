import { describe, expect, it } from "vitest";
import { combineFootballListSources, mergeFootballClientLists } from "@/runtime/footballClientList";
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

  it("keeps a catalog league when the other venue is unknown_fb", () => {
    const pm = dto({ Game: "unknown_fb" });
    const ob = dto({ Game: "epl" });
    expect(mergeFootballClientLists([pm], [ob])[0].Game).toBe("epl");
  });

  it("prefers OB trial title, league, and kickoff when overlaying PM", () => {
    const pm = dto({
      Title: "Arsenal vs Chelsea",
      Game: "epl",
      StartTime: 1_700_000_000_000,
      Matchs: { Polymarket: "pm1" },
    });
    const ob = dto({
      ID: 820000001,
      Title: "Arsenal vs Chelsea",
      Game: "英超",
      StartTime: 1_700_000_100_000,
      Matchs: { OB: "5652292" },
    });
    const merged = mergeFootballClientLists([pm], [ob]);
    expect(merged).toHaveLength(1);
    expect(merged[0].Title).toBe("Arsenal vs Chelsea");
    expect(merged[0].Game).toBe("英超");
    expect(merged[0].StartTime).toBe(1_700_000_100_000);
    expect(merged[0].Matchs).toMatchObject({ Polymarket: "pm1", OB: "5652292" });
  });


  it("orders merged matches by StartTime", () => {
    const later = dto({ ID: 1, Title: "Later vs Team", StartTime: 200 });
    const sooner = dto({ ID: 2, Title: "Soon vs Team", StartTime: 100 });
    expect(mergeFootballClientLists([later], [sooner]).map(m => m.ID)).toEqual([2, 1]);
  });

  it("keeps OB matches when PM/PF times out", async () => {
    const ob = dto({ ID: 820000001, Title: "Live vs Team", Matchs: { OB: "mid-1" } });
    const list = await combineFootballListSources(
      Promise.reject(new Error("timeout of 15000ms exceeded")),
      Promise.resolve([ob]),
    );
    expect(list).toHaveLength(1);
    expect(list[0].Matchs?.OB).toBe("mid-1");
  });

  it("rethrows timeout when both sources fail", async () => {
    await expect(combineFootballListSources(
      Promise.reject(new Error("timeout of 15000ms exceeded")),
      Promise.reject(new Error("ob down")),
    )).rejects.toThrow("timeout of 15000ms exceeded");
  });
});

describe("mergeFootballClientLists identity key", () => {
  const T = 1_700_000_000_000;

  function pmRow(partial: Partial<ClientMatchDto>): ClientMatchDto {
    return {
      ID: 1,
      Title: "CF América vs CD Guadalajara",
      Game: "mex",
      GameID: 0,
      StartTime: T,
      Matchs: { Polymarket: "pm-mx" },
      Bets: [{
        ID: 11,
        MatchID: 1,
        Map: 0,
        Name: "全场胜负",
        MarketCode: "moneyline",
        Line: null,
        HomeName: "CF América",
        AwayName: "CD Guadalajara",
        HomeID: 1,
        AwayID: 2,
        Sources: { Polymarket: { Type: "Polymarket", BetID: "p", HomeID: "h", AwayID: "a", HomeOdds: 2.1, AwayOdds: 3.2, Status: "Normal" } },
      }] as unknown as ClientMatchDto["Bets"],
      ...partial,
    } as ClientMatchDto;
  }

  function obRow(partial: Partial<ClientMatchDto>): ClientMatchDto {
    return {
      ID: 820000001,
      Title: "Club America vs CD Guadalajara Chivas",
      Game: "Mexico Liga MX",
      GameID: 0,
      StartTime: T,
      Matchs: { OB: "mid-mx" },
      Bets: [{
        ID: 21,
        MatchID: 820000001,
        Map: 0,
        Name: "全场胜负",
        MarketCode: "moneyline",
        Line: null,
        HomeName: "Club America",
        AwayName: "CD Guadalajara Chivas",
        HomeID: 1,
        AwayID: 2,
        Sources: { OB: { Type: "OB", BetID: "o", HomeID: "oh", AwayID: "oa", HomeOdds: 2.0, AwayOdds: 3.4, Status: "Normal" } },
      }] as unknown as ClientMatchDto["Bets"],
      ...partial,
    } as ClientMatchDto;
  }

  it("merges Liga MX same match across renamed teams (certain)", () => {
    const merged = mergeFootballClientLists([pmRow({})], [obRow({})]);
    expect(merged).toHaveLength(1);
    expect(merged[0].Matchs).toMatchObject({ Polymarket: "pm-mx", OB: "mid-mx" });
    expect(merged[0].Bets?.[0]?.Sources?.OB?.Type).toBe("OB");
    expect(merged[0].MergeGuess).toBeFalsy();
  });

  it("flags token-subset merges as guess", () => {
    const pm = pmRow({ Title: "Alpha United vs Beta", Game: "uef", Matchs: { Polymarket: "pm-a" } });
    const ob = obRow({ Title: "Alpha vs Beta", Game: "uef", Matchs: { OB: "mid-a" } });
    const merged = mergeFootballClientLists([pm], [ob]);
    expect(merged).toHaveLength(1);
    expect(merged[0].MergeGuess).toBe(true);
  });

  it("clears the guess flag when an exact row later confirms the merge", () => {
    const pm = pmRow({ Title: "Alpha United vs Beta", Game: "uef", Matchs: { Polymarket: "pm-a" } });
    const obGuess = obRow({ Title: "Alpha vs Beta", Game: "uef", Matchs: { OB: "mid-g" } });
    const obExact = obRow({
      ID: 820000002,
      Title: "Alpha United vs Beta",
      Game: "uef",
      Matchs: { OB: "mid-e" },
      Bets: [],
    });
    const merged = mergeFootballClientLists([pm], [obGuess, obExact]);
    expect(merged).toHaveLength(1);
    expect(merged[0].MergeGuess).toBeFalsy();
    expect(merged[0].Matchs).toMatchObject({ Polymarket: "pm-a", OB: "mid-e" });
  });

  it("reorients flipped OB books before overlaying spreads", () => {
    const pm = pmRow({
      Bets: [{
        ID: 11, MatchID: 1, Map: 0, Name: "让球 -0.5", MarketCode: "spreads", Line: -0.5,
        HomeName: "CF América", AwayName: "CD Guadalajara", HomeID: 1, AwayID: 2,
        Sources: { Polymarket: { Type: "Polymarket", BetID: "p", HomeID: "h", AwayID: "a", HomeOdds: 2.0, AwayOdds: 1.8, Status: "Normal" } },
      }] as unknown as ClientMatchDto["Bets"],
    });
    const ob = obRow({
      Title: "CD Guadalajara Chivas vs Club America",
      Bets: [{
        ID: 21, MatchID: 820000001, Map: 0, Name: "让球 -0.5", MarketCode: "spreads", Line: 0.5,
        HomeName: "CD Guadalajara Chivas", AwayName: "Club America", HomeID: 1, AwayID: 2,
        Sources: { OB: { Type: "OB", BetID: "o", HomeID: "oh", AwayID: "oa", HomeOdds: 1.9, AwayOdds: 2.1, Status: "Normal" } },
      }] as unknown as ClientMatchDto["Bets"],
    });
    const merged = mergeFootballClientLists([pm], [ob]);
    expect(merged).toHaveLength(1);
    expect(merged[0].Bets).toHaveLength(1);
    expect(merged[0].Bets?.[0]?.Line).toBe(-0.5);
    expect(merged[0].Bets?.[0]?.Sources?.OB?.HomeOdds).toBe(2.1);
    expect(merged[0].Bets?.[0]?.Sources?.OB?.AwayOdds).toBe(1.9);
  });

  it("keeps matches in different kickoff hours separate", () => {
    const merged = mergeFootballClientLists([pmRow({})], [obRow({ StartTime: T + 3_600_000 })]);
    expect(merged).toHaveLength(2);
  });

  it("keeps matches in different real leagues separate", () => {
    const pm = pmRow({ Title: "Arsenal vs Chelsea", Game: "epl", Matchs: { Polymarket: "pm-e" } });
    const ob = obRow({ Title: "Arsenal vs Chelsea", Game: "lal", Matchs: { OB: "mid-l" } });
    expect(mergeFootballClientLists([pm], [ob])).toHaveLength(2);
  });

  it("falls back to the legacy title key for placeholder OB rows", () => {
    const a = obRow({ Title: "Mexico Liga MX 88392921", Matchs: { OB: "m1" } });
    const b = obRow({ Title: "Mexico Liga MX 88392921", Matchs: { OB: "m2" } });
    const merged = mergeFootballClientLists([], [a, b]);
    expect(merged).toHaveLength(1);
    expect(merged[0].Matchs).toMatchObject({ OB: "m2" });
  });
});
