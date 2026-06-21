/** 与 gamebet_frontend/src/collectors/im/parse.ts 保持同步 */

const CN_DIGIT: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
};

export function pickStr(obj: unknown, ...keys: string[]): string {
  if (!obj || typeof obj !== "object")
    return "";
  const o = obj as Record<string, unknown>;
  for (const k of keys) {
    const v = o[k];
    if (v != null && v !== "")
      return String(v);
  }
  return "";
}

export function imBetNameIsFullMatch(name: unknown): boolean {
  const text = String(name || "").replace(/\s+/g, "");
  if (!text)
    return false;
  if (/全场|总比赛|系列赛|BO\d/i.test(text))
    return true;
  if ((/比赛.*胜|胜负/.test(text) || /获胜/.test(text)) && !/第.+局/.test(text))
    return true;
  return false;
}

export function parseImMapFromBetName(name: unknown): number {
  const text = String(name || "").replace(/\s+/g, "");
  if (!text || imBetNameIsFullMatch(name))
    return 0;
  const m = text.match(/第([一二三四五六七八九十\d]+)局/);
  if (!m)
    return 0;
  const token = m[1];
  if (/^\d+$/.test(token))
    return Number(token) || 0;
  if (token.length === 1)
    return CN_DIGIT[token] ?? 0;
  if (token === "十")
    return 10;
  if (token.startsWith("十") && token.length === 2)
    return CN_DIGIT[token[1]] ?? 0;
  if (token.endsWith("十") && token.length === 2)
    return (CN_DIGIT[token[0]] ?? 0) * 10;
  return 0;
}

export function imBetNameIsMapWinner(name: unknown): boolean {
  const text = String(name || "");
  if (!text || imBetNameIsFullMatch(name))
    return false;
  return /第\s*(?:\S.*|[\t\v\f \xA0  -   　﻿])\s*局.*胜/.test(text) || /局.*胜利/.test(text);
}

export function imBetNameIsCollectible(name: unknown): boolean {
  if (!name)
    return true;
  return imBetNameIsFullMatch(name) || imBetNameIsMapWinner(name);
}

export function resolveImMap(bet: Record<string, unknown>): number {
  const name = pickStr(bet, "name", "Name", "betName", "BetName");
  if (name && imBetNameIsFullMatch(name))
    return 0;
  const fromName = name ? parseImMapFromBetName(name) : 0;
  if (fromName > 0)
    return fromName;
  const raw = bet.map ?? bet.Map ?? bet.gamenr ?? bet.gameNr;
  if (raw == null || raw === "")
    return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export function normalizeImBet(bet: Record<string, unknown>): Record<string, unknown> {
  const name = pickStr(bet, "name", "Name", "betName", "BetName");
  const map = resolveImMap(bet);
  return {
    ...bet,
    name: name || bet.name,
    map,
    Map: map,
    BetName: name || bet.BetName,
    sportId: pickStr(bet, "sportId", "SportId", "gameId", "GameId") || bet.sportId,
  };
}

export function pickImSportId(obj: unknown): string {
  if (!obj || typeof obj !== "object")
    return "";
  return pickStr(
    obj,
    "sportId",
    "SportId",
    "sportID",
    "gameId",
    "GameId",
    "gameID",
    "spid",
    "SpId",
    "sid",
  );
}

export function normalizeImMatchFields(match: Record<string, unknown>): Record<string, unknown> {
  if (!match)
    return match;
  const sportId = pickImSportId(match) || (match.SourceGameID as string);
  const home = pickStr(match, "homeName", "HomeName", "Home", "home");
  const away = pickStr(match, "awayName", "AwayName", "Away", "away");
  return {
    ...match,
    SourceGameID: sportId && sportId !== "unknown" ? sportId : match.SourceGameID,
    Home: home || match.Home,
    Away: away || match.Away,
  };
}
