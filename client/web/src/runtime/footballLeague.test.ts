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

function match(id: number, title: string, game: string, startAt = 1): ViewMatch {
  return new ViewMatch({
    ID: id,
    Title: title,
    Game: game,
    GameID: 0,
    StartTime: startAt,
    Matchs: {},
    Bets: [],
  } as unknown as ClientMatchDto);
}

describe("footballLeague", () => {
  it("treats epl and 英超 as the same league", () => {
    expect(footballLeagueKey("epl")).toBe("epl");
    expect(footballLeagueKey("英超")).toBe("epl");
    expect(footballLeagueKey("英格兰超级联赛")).toBe("epl");
    expect(footballLeagueLabel("epl")).toBe("英超");
    expect(footballLeagueLabel("英格兰超级联赛")).toBe("英格兰超级联赛");
    expect(footballLeagueTag("epl")).toBe("英超");
  });


  it("keeps unmapped OB tournament names instead of dumping into 未分类", () => {
    expect(footballLeagueKey("希腊U19联赛")).toBe("希腊U19联赛");
    expect(footballLeagueLabel("希腊U19联赛")).toBe("希腊U19联赛");
    expect(footballLeagueTag("unknown_fb")).toBe("");
    expect(footballLeagueLabel("unknown_fb")).toBe("未分类");
  });

  it("uses the native league name when Game is unknown_fb but League is present", () => {
    expect(footballLeagueKey("unknown_fb", "K-league")).toBe("league:韩K联");
    expect(footballLeagueLabel("unknown_fb", "K-league")).toBe("韩K联");
    expect(footballLeagueTag("unknown_fb", "K-league")).toBe("韩K联");
    expect(footballLeagueKey("epl", "K-league")).toBe("epl");
    expect(footballLeagueLabel("epl", "K-league")).toBe("英超");
    expect(footballLeagueTag("epl", "K-league")).toBe("英超");
    // 映射表未收录：保留 PM 原文（含去尾部年份归一化后仍不命中）
    expect(footballLeagueLabel("unknown_fb", "Zambian Super League")).toBe("Zambian Super League");
    // 命中映射且标题带年份后缀
    expect(footballLeagueLabel("unknown_fb", "Norwegian Eliteserien 2026")).toBe("挪超");
    // 无 League 时退回原行为
    expect(footballLeagueKey("unknown_fb")).toBe("unknown_fb");
    expect(footballLeagueLabel("unknown_fb")).toBe("未分类");
  });

  it("groups unknown_fb matches by mapped league name", () => {
    const a = match(1, "A vs B", "unknown_fb");
    a.league = "K-league";
    const b = match(2, "C vs D", "unknown_fb");
    b.league = "K League 2";
    const c = match(3, "E vs F", "unknown_fb");
    c.league = "USL Championship";
    const d = match(4, "G vs H", "unknown_fb");
    const groups = groupFootballMatchesByLeague([a, b, c, d]);
    expect(groups.map(g => g.league)).toEqual(["韩K2", "韩K联", "美冠USL", "未分类"]);
    expect(groups.find(g => g.key === "league:韩K联")?.matches).toHaveLength(1);
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
    const trial = groupFootballMatchesByLeague([
      match(1, "A vs B", "epl"),
      match(5, "I vs J", "英格兰超级联赛"),
    ]);
    expect(trial).toHaveLength(1);
    expect(trial[0]?.key).toBe("epl");

  });

  it("sorts matches inside a league by kickoff time", () => {
    const groups = groupFootballMatchesByLeague([
      match(2, "Later vs Team", "epl", 200),
      match(1, "Soon vs Team", "epl", 100),
    ]);
    expect(groups[0]?.matches.map(m => m.id)).toEqual([1, 2]);
  });

  it("maps OB tournament names instead of dumping into unknown_fb", () => {
    expect(resolveObFootballGame("180", "", "")).toBe("epl");
    expect(resolveObFootballGame("", "英格兰超级联赛", "")).toBe("epl");
    expect(resolveObFootballGame("", "希腊U19联赛", "希腊U19")).toBe("希腊U19");
    expect(footballLeagueTag(resolveObFootballGame("", "希腊U19联赛", "希腊U19"))).toBe("希腊U19");
  });
});
