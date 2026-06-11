"use strict";

/** 与 gamebet_frontend/src/collectors/im/parse.ts 保持同步 */

const CN_DIGIT = {
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

function pickStr(obj, ...keys) {
  if (!obj || typeof obj !== "object") return "";
  for (const k of keys) {
    const v = obj[k];
    if (v != null && v !== "") return String(v);
  }
  return "";
}

function imBetNameIsFullMatch(name) {
  const text = String(name || "").replace(/\s+/g, "");
  if (!text) return false;
  if (/全场|总比赛|系列赛|BO\d/i.test(text)) return true;
  if ((/比赛.*胜|胜负/.test(text) || /获胜/.test(text)) && !/第.+局/.test(text)) return true;
  return false;
}

function parseImMapFromBetName(name) {
  const text = String(name || "").replace(/\s+/g, "");
  if (!text || imBetNameIsFullMatch(name)) return 0;
  const m = text.match(/第([一二三四五六七八九十\d]+)局/);
  if (!m) return 0;
  const token = m[1];
  if (/^\d+$/.test(token)) return Number(token) || 0;
  if (token.length === 1) return CN_DIGIT[token] ?? 0;
  if (token === "十") return 10;
  if (token.startsWith("十") && token.length === 2) return CN_DIGIT[token[1]] ?? 0;
  if (token.endsWith("十") && token.length === 2) return (CN_DIGIT[token[0]] ?? 0) * 10;
  return 0;
}

function imBetNameIsMapWinner(name) {
  const text = String(name || "");
  if (!text || imBetNameIsFullMatch(name)) return false;
  return /第\s*.+\s*局.*胜/.test(text) || /局.*胜利/.test(text);
}

function imBetNameIsCollectible(name) {
  if (!name) return true;
  return imBetNameIsFullMatch(name) || imBetNameIsMapWinner(name);
}

function resolveImMap(bet) {
  const name = pickStr(bet, "name", "Name", "betName", "BetName");
  if (name && imBetNameIsFullMatch(name)) return 0;
  const fromName = name ? parseImMapFromBetName(name) : 0;
  if (fromName > 0) return fromName;
  const raw = bet.map ?? bet.Map ?? bet.gamenr ?? bet.gameNr;
  if (raw == null || raw === "") return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function normalizeImBet(bet) {
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

function pickImSportId(obj) {
  if (!obj || typeof obj !== "object") return "";
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

function normalizeImMatchFields(match) {
  if (!match) return match;
  const sportId = pickImSportId(match) || match.SourceGameID;
  const home = pickStr(match, "homeName", "HomeName", "Home", "home");
  const away = pickStr(match, "awayName", "AwayName", "Away", "away");
  return {
    ...match,
    SourceGameID: sportId && sportId !== "unknown" ? sportId : match.SourceGameID,
    Home: home || match.Home,
    Away: away || match.Away,
  };
}

module.exports = {
  pickStr,
  pickImSportId,
  imBetNameIsFullMatch,
  parseImMapFromBetName,
  imBetNameIsMapWinner,
  imBetNameIsCollectible,
  resolveImMap,
  normalizeImBet,
  normalizeImMatchFields,
};
