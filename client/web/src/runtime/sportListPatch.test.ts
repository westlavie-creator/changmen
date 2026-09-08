import { describe, expect, it } from "vitest";
import { ViewMatch } from "@/models/match";
import type { ClientMatchDto } from "@/types/esport";
import { patchSportViewMatches, sportMatchStableKey } from "@/runtime/sportListPatch";

function view(partial: Partial<ClientMatchDto>): ViewMatch {
  return new ViewMatch({
    ID: 1,
    Title: "A vs B",
    Game: "epl",
    GameID: 0,
    StartTime: 100,
    Matchs: {},
    Bets: [],
    ...partial,
  } as ClientMatchDto);
}

describe("sportListPatch", () => {
  it("keys OB matches by mid so PM id churn does not remount", () => {
    expect(sportMatchStableKey({ id: 1, providers: { OB: "5652292" } })).toBe("ob:5652292");
    expect(sportMatchStableKey({ id: 9, providers: {} })).toBe("id:9");
  });

  it("reuses the previous ViewMatch object and copies new data", () => {
    const prev = view({ ID: 11, Title: "A vs B", Matchs: { OB: "5652292" }, StartTime: 1_700_000_000_000 });
    const next = view({
      ID: 99,
      Title: "阿森纳 vs 切尔西",
      Game: "英超",
      Matchs: { OB: "5652292", Polymarket: "pm1" },
      StartTime: 1_700_000_100_000,
    });
    const out = patchSportViewMatches([prev], [next]);
    expect(out).toHaveLength(1);
    expect(out[0]).toBe(prev);
    expect(out[0].id).toBe(11);
    expect(out[0].title).toBe("阿森纳 vs 切尔西");
    expect(out[0].game).toBe("英超");
    expect(out[0].startAt).toBe(1_700_000_100_000);
    expect(out[0].providers).toMatchObject({ OB: "5652292", Polymarket: "pm1" });
  });

  it("appends new matches and drops gone ones", () => {
    const keep = view({ ID: 1, Matchs: { OB: "1" } });
    const gone = view({ ID: 2, Matchs: { OB: "2" } });
    const added = view({ ID: 3, Title: "C vs D", Matchs: { OB: "3" } });
    const out = patchSportViewMatches([keep, gone], [
      view({ ID: 1, Title: "A2 vs B2", Matchs: { OB: "1" } }),
      added,
    ]);
    expect(out.map(m => sportMatchStableKey(m))).toEqual(["ob:1", "ob:3"]);
    expect(out[0]).toBe(keep);
    expect(out[0].title).toBe("A2 vs B2");
    expect(out[1]).toBe(added);
  });
});
