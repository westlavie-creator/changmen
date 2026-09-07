import { describe, expect, it } from "vitest";
import { ViewMatch } from "@/models/match";
import type { ClientMatchDto } from "@/types/esport";
import {
  footballLeagueKey,
  footballLeagueLabel,
  footballLeagueTag,
  groupFootballMatchesByLeague,
  pickBetterFootballGame,
  resolveObFootballGame,
} from "@/runtime/footballLeague";

function match(id: number, title: string, game: string): ViewMatch {
  return new ViewMatch({
    ID: id,
    Title: title,
    Game: game,
    GameID: 0,
    StartTime: 1,
    Matchs: {},
    Bets: [],
  } as unknown as ClientMatchDto);
}

describe("footballLeague", () => {
  it("treats epl and 英超 as the same league", () => {
    expect(footballLeagueKey("epl")).toBe("epl");
    expect(footballLeagueKey("英超")).toBe("epl");
    expect(footballLeagueLabel("epl")).toBe("英超");
    expect(footballLeagueTag("epl")).toBe("英超");
  });

  it("keeps unmapped OB tournament names instead of dumping into 未分类", () => {
    expect(footballLeagueKey("希腊U19联赛")).toBe("希腊U19联赛");
    expect(footballLeagueLabel("希腊U19联赛")).toBe("希腊U19联赛");
    expect(footballLeagueTag("unknown_fb")).toBe("");
    expect(footballLeagueLabel("unknown_fb")).toBe("未分类");
  });

  it("prefers a catalog league when merging venues", () => {
    expect(pickBetterFootballGame("unknown_fb", "epl")).toBe("epl");
    expect(pickBetterFootballGame("epl", "希腊U19联赛")).toBe("epl");
    expect(pickBetterFootballGame("", "希腊U19联赛")).toBe("希腊U19联赛");
  });

  it("groups matches by league like esport games", () => {
    const groups = groupFootballMatchesByLeague([
      match(1, "A vs B", "epl"),
      match(2, "C vs D", "英超"),
      match(3, "E vs F", "lal"),
      match(4, "G vs H", "unknown_fb"),
    ]);
    expect(groups.map(g => g.league)).toEqual(["西甲", "英超", "未分类"]);
    expect(groups.find(g => g.key === "epl")?.matches).toHaveLength(2);
  });

  it("maps OB tournament names instead of dumping into unknown_fb", () => {
    expect(resolveObFootballGame("180", "", "")).toBe("epl");
    expect(resolveObFootballGame("", "英格兰超级联赛", "")).toBe("epl");
    expect(resolveObFootballGame("", "希腊U19联赛", "希腊U19")).toBe("希腊U19");
    expect(footballLeagueTag(resolveObFootballGame("", "希腊U19联赛", "希腊U19"))).toBe("希腊U19");
  });
});
