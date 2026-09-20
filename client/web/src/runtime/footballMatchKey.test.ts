import { describe, expect, it } from "vitest";
import type { ClientMatchDto } from "@/types/esport";
import {
  footballLeagueMatch,
  footballRowIdentity,
  pairMatchTier,
  reorientFootballRow,
} from "@/runtime/footballMatchKey";

function row(partial: Partial<ClientMatchDto>): ClientMatchDto {
  return {
    ID: 1,
    Title: "CF América vs CD Guadalajara",
    Game: "mex",
    GameID: 0,
    StartTime: 1_700_000_000_000,
    Matchs: {},
    Bets: [],
    ...partial,
  } as ClientMatchDto;
}

describe("footballRowIdentity", () => {
  it("resolves league text to a code and canonical team pair", () => {
    const id = footballRowIdentity(row({ Game: "Mexico Liga MX" }));
    expect(id).not.toBeNull();
    expect(id?.leagueKey).toBe("mex");
    expect(id?.pair).toEqual(["america", "guadalajara"]);
    expect(id?.hour).toBe(Math.floor(1_700_000_000_000 / 3_600_000));
  });

  it("returns null for OB placeholder titles without teams", () => {
    expect(footballRowIdentity(row({ Title: "Mexico Liga MX 88392921" }))).toBeNull();
    expect(footballRowIdentity(row({ Title: "" }))).toBeNull();
  });

  it("returns null for outcome-label titles", () => {
    expect(footballRowIdentity(row({ Title: "大 vs 小" }))).toBeNull();
    expect(footballRowIdentity(row({ Title: "Over vs Under" }))).toBeNull();
  });

  it("keeps raw league text as its own key when unresolvable", () => {
    const id = footballRowIdentity(row({ Game: "Some Future Cup" }));
    expect(id?.leagueKey).toBe("Some Future Cup");
  });
});

describe("footballLeagueMatch", () => {
  it("matches equal codes and wildcards unknown_fb", () => {
    expect(footballLeagueMatch("mex", "mex")).toBe(true);
    expect(footballLeagueMatch("unknown_fb", "epl")).toBe(true);
    expect(footballLeagueMatch("epl", "unknown_fb")).toBe(true);
  });

  it("rejects different real codes and raw text against a code", () => {
    expect(footballLeagueMatch("epl", "lal")).toBe(false);
    expect(footballLeagueMatch("mex", "Some Future Cup")).toBe(false);
  });
});

describe("pairMatchTier", () => {
  const anchor = footballRowIdentity(row({}))!;

  it("matches exact same orientation", () => {
    const cand = footballRowIdentity(row({}))!;
    expect(pairMatchTier(anchor, cand)).toEqual({ tier: "exact", flip: false });
  });

  it("matches exact flipped orientation", () => {
    const cand = footballRowIdentity(row({
      Title: "CD Guadalajara vs CF América",
      Game: "Mexico Liga MX",
    }))!;
    expect(pairMatchTier(anchor, cand)).toEqual({ tier: "exact", flip: true });
  });

  it("matches token-subset as guess", () => {
    const cand = footballRowIdentity(row({
      Title: "Alpha vs Beta",
      Game: "mex",
    }))!;
    const guessAnchor = footballRowIdentity(row({
      Title: "Alpha United vs Beta",
      Game: "mex",
    }))!;
    expect(pairMatchTier(guessAnchor, cand)).toEqual({ tier: "guess", flip: false });
    const flippedGuessCand = footballRowIdentity(row({
      Title: "Beta vs Alpha",
      Game: "mex",
    }))!;
    expect(pairMatchTier(guessAnchor, flippedGuessCand)).toEqual({ tier: "guess", flip: true });
  });

  it("returns null for different pairs", () => {
    const cand = footballRowIdentity(row({ Title: "Arsenal vs Chelsea" }))!;
    expect(pairMatchTier(anchor, cand)).toBeNull();
  });
});

describe("reorientFootballRow", () => {
  it("swaps teams, swaps odds, negates spreads, keeps totals", () => {
    const flipped = row({
      Title: "AwayB vs HomeA",
      Bets: [
        {
          ID: 1, MatchID: 1, Map: 0, Name: "全场胜负", MarketCode: "moneyline", Line: null,
          HomeName: "AwayB", AwayName: "HomeA", HomeID: 1, AwayID: 2,
          Sources: { OB: { Type: "OB", BetID: "o", HomeID: "oh", AwayID: "oa", HomeOdds: 1.9, AwayOdds: 2.2, Status: "Normal" } },
        },
        {
          ID: 2, MatchID: 1, Map: 0, Name: "让球 -0.5", MarketCode: "spreads", Line: 0.5,
          HomeName: "AwayB", AwayName: "HomeA", HomeID: 3, AwayID: 4,
          Sources: { OB: { Type: "OB", BetID: "s", HomeID: "sh", AwayID: "sa", HomeOdds: 1.8, AwayOdds: 2.0, Status: "Normal" } },
        },
        {
          ID: 3, MatchID: 1, Map: 0, Name: "大小 2.5", MarketCode: "totals", Line: 2.5,
          HomeName: "大", AwayName: "小", HomeID: 5, AwayID: 6,
          Sources: { OB: { Type: "OB", BetID: "t", HomeID: "th", AwayID: "ta", HomeOdds: 1.95, AwayOdds: 1.85, Status: "Normal" } },
        },
      ] as unknown as ClientMatchDto["Bets"],
    });
    const out = reorientFootballRow(flipped);
    expect(out.Title).toBe("HomeA vs AwayB");
    const [ml, sp, tt] = out.Bets!;
    expect(ml.HomeName).toBe("HomeA");
    expect(ml.AwayName).toBe("AwayB");
    expect(ml.Sources?.OB?.HomeOdds).toBe(2.2);
    expect(ml.Sources?.OB?.AwayOdds).toBe(1.9);
    expect(ml.Sources?.OB?.HomeID).toBe("oa");
    expect(ml.Sources?.OB?.AwayID).toBe("oh");
    expect(sp.Line).toBe(-0.5);
    expect(sp.HomeName).toBe("HomeA");
    expect(tt.Line).toBe(2.5);
    expect(tt.HomeName).toBe("大");
    // totals 与主客朝向无关：source 原样保留（对齐 server orientSource，oid 不可错配）
    expect(tt.Sources?.OB?.HomeOdds).toBe(1.95);
    expect(tt.Sources?.OB?.AwayOdds).toBe(1.85);
    expect(tt.Sources?.OB?.HomeID).toBe("th");
    expect(tt.Sources?.OB?.AwayID).toBe("ta");
    expect(tt.Sources?.OB?.BetID).toBe("t");
  });
});
