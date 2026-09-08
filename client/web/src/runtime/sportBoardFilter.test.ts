import { describe, expect, it } from "vitest";
import { ViewMatch } from "@/models/match";
import type { ClientMatchDto } from "@/types/esport";
import {
  FOOTBALL_UPCOMING_MS,
  filterSportBoardMatches,
  isFootballJunkMatchTitle,
  matchInUpcomingWindow,
} from "@/runtime/sportBoardFilter";

function match(id: number, title: string, startAt: number, game = "epl", providers: Record<string, string> = {}): ViewMatch {
  const dto = {
    ID: id,
    Title: title,
    Game: game,
    GameID: 0,
    StartTime: startAt,
    Matchs: providers,
    Bets: [],
  } as unknown as ClientMatchDto;
  return new ViewMatch(dto);
}

describe("sportBoardFilter", () => {
  const now = 1_800_000_000_000;

  it("keeps matches in next 2h and recent in-play", () => {
    expect(matchInUpcomingWindow(now + 1 * 3600_000, now)).toBe(true);
    expect(matchInUpcomingWindow(now + 3 * 3600_000, now)).toBe(false);
    expect(matchInUpcomingWindow(now - 30 * 60_000, now)).toBe(true);
    expect(matchInUpcomingWindow(now - 3 * 3600_000, now)).toBe(true);
    expect(matchInUpcomingWindow(now - 5 * 3600_000, now)).toBe(false);
  });

  it("keeps in-play kickoff within 4h lookback on the board", () => {
    const live = match(3, "Live vs Team", now - 3 * 3600_000);
    const old = match(4, "Old vs Team", now - 5 * 3600_000);
    const def = filterSportBoardMatches([live, old], { horizonMs: FOOTBALL_UPCOMING_MS, now });
    expect(def.map(m => m.id)).toEqual([3]);
  });

  it("crops Polymarket / PredictFun to the same 2h/4h window", () => {
    const pmLater = match(5, "Cagliari vs Lecce", now + 10 * 3600_000, "sea", { Polymarket: "pm1" });
    const pfLater = match(6, "Al Khaleej vs Al Riyadh", now + 6 * 3600_000, "spl", { PredictFun: "pf1" });
    const obLater = match(7, "OB later vs Team", now + 10 * 3600_000, "epl", { OB: "mid-1" });
    const pmSoon = match(8, "Arsenal vs Chelsea", now + 1 * 3600_000, "epl", { Polymarket: "pm2" });
    const def = filterSportBoardMatches([pmLater, pfLater, obLater, pmSoon], { horizonMs: FOOTBALL_UPCOMING_MS, now });
    expect(def.map(m => m.id)).toEqual([8]);
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

  it("search matches the Chinese league label, not just the catalog code", () => {
    const epl = match(1, "Arsenal vs Chelsea", now + 3600_000, "epl");
    const lal = match(2, "Barca vs Madrid", now + 3600_000, "lal");
    const searched = filterSportBoardMatches([epl, lal], {
      query: "英超",
      horizonMs: FOOTBALL_UPCOMING_MS,
      now,
    });
    expect(searched.map(m => m.id)).toEqual([1]);
  });

  it("search 英超 also hits trial full names", () => {
    const row = match(1, "阿森纳 vs 切尔西", now + 3600_000, "英格兰超级联赛");
    const searched = filterSportBoardMatches([row], {
      query: "英超",
      horizonMs: FOOTBALL_UPCOMING_MS,
      now,
    });
    expect(searched.map(m => m.id)).toEqual([1]);
  });


  it("sorts remaining matches by kickoff time", () => {
    const later = match(2, "Later vs Team", now + 90 * 60_000);
    const sooner = match(1, "Soon vs Team", now + 20 * 60_000);
    const live = match(3, "Live vs Team", now - 10 * 60_000);
    const def = filterSportBoardMatches([later, sooner, live], { horizonMs: FOOTBALL_UPCOMING_MS, now });
    expect(def.map(m => m.id)).toEqual([3, 1, 2]);
  });

  it("search also returns matches in kickoff order", () => {
    const later = match(2, "Arsenal vs Chelsea", now + 90 * 60_000);
    const sooner = match(1, "Arsenal vs Everton", now + 20 * 60_000);
    const searched = filterSportBoardMatches([later, sooner], {
      query: "arsenal",
      horizonMs: FOOTBALL_UPCOMING_MS,
      now,
    });
    expect(searched.map(m => m.id)).toEqual([1, 2]);
  });
});
