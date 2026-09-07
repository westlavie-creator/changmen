import { describe, expect, it } from "vitest";
import { ViewMatch } from "@/models/match";
import type { ClientMatchDto } from "@/types/esport";
import {
  FOOTBALL_UPCOMING_MS,
  filterSportBoardMatches,
  isFootballJunkMatchTitle,
  matchInUpcomingWindow,
} from "@/runtime/sportBoardFilter";

function match(id: number, title: string, startAt: number, game = "epl"): ViewMatch {
  const dto = {
    ID: id,
    Title: title,
    Game: game,
    GameID: 0,
    StartTime: startAt,
    Matchs: {},
    Bets: [],
  } as unknown as ClientMatchDto;
  return new ViewMatch(dto);
}

describe("sportBoardFilter", () => {
  const now = 1_800_000_000_000;

  it("keeps matches in next 6h and recent in-play", () => {
    expect(matchInUpcomingWindow(now + 3 * 3600_000, now)).toBe(true);
    expect(matchInUpcomingWindow(now + 7 * 3600_000, now)).toBe(false);
    expect(matchInUpcomingWindow(now - 30 * 60_000, now)).toBe(true);
    expect(matchInUpcomingWindow(now - 3 * 3600_000, now)).toBe(false);
  });

  it("defaults to upcoming window; search bypasses the window", () => {
    const soon = match(1, "Arsenal vs Chelsea", now + 3600_000);
    const later = match(2, "Liverpool vs Everton", now + 10 * 3600_000);
    const list = [soon, later];
    const def = filterSportBoardMatches(list, { horizonMs: FOOTBALL_UPCOMING_MS, now });
    expect(def.map(m => m.id)).toEqual([1]);
    const searched = filterSportBoardMatches(list, {
      query: "liverpool",
      horizonMs: FOOTBALL_UPCOMING_MS,
      now,
    });
    expect(searched.map(m => m.id)).toEqual([2]);
  });

  it("drops 大 vs 小 shell titles", () => {
    expect(isFootballJunkMatchTitle("大 vs 小")).toBe(true);
    expect(isFootballJunkMatchTitle("Over vs Under")).toBe(true);
    expect(isFootballJunkMatchTitle("甲队 vs 乙队")).toBe(false);
    const junk = match(9, "大 vs 小", now + 3600_000, "unknown_fb");
    const ok = match(1, "Arsenal vs Chelsea", now + 3600_000);
    const def = filterSportBoardMatches([junk, ok], { horizonMs: FOOTBALL_UPCOMING_MS, now });
    expect(def.map(m => m.id)).toEqual([1]);
  });
});
