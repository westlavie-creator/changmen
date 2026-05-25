"use strict";

const catalog = require("./game_catalog.json");

/** 平博 league.gameCode 经 slugify 后的别名 → catalog code */
const PB_SLUG_ALIASES = {
  cs: "cs2",
  cs2: "cs2",
  "counter-strike-2": "cs2",
  valorant: "valorant",
  lol: "lol",
  "league-of-legends": "lol",
  dota2: "dota2",
  "dota-2": "dota2",
  kog: "kog",
  "king-of-glory": "kog",
  "honor-of-kings": "kog",
};

function listGames() {
  return catalog.games.slice();
}

function getGameByCode(code) {
  return catalog.games.find((g) => g.code === code) || null;
}

function parseActiveGameCodes() {
  const raw = process.env.AGGREGATE_GAME_CODES;
  if (!raw || raw === "*") {
    return catalog.games.map((g) => g.code);
  }
  const wanted = new Set(
    raw
      .split(/[,;\s]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
  return catalog.games.filter((g) => wanted.has(g.code)).map((g) => g.code);
}

function getActiveGames() {
  const codes = new Set(parseActiveGameCodes());
  return catalog.games.filter((g) => codes.has(g.code));
}

function getPlatformGameId(platform, code) {
  const game = getGameByCode(code);
  const id = game?.platforms?.[platform];
  return id != null ? String(id) : null;
}

function getGameCodeForPlatformId(platform, gameId) {
  const id = String(gameId);
  if (platform === "PB") {
    const alias = PB_SLUG_ALIASES[id];
    if (alias) return alias;
  }
  for (const game of catalog.games) {
    if (String(game.platforms?.[platform]) === id) {
      return game.code;
    }
  }
  return null;
}

function isAllowedPlatformGameId(platform, gameId) {
  const code = getGameCodeForPlatformId(platform, gameId);
  if (!code) return false;
  return parseActiveGameCodes().includes(code);
}

function getActivePlatformGameIds(platform) {
  return getActiveGames()
    .map((g) => g.platforms?.[platform])
    .filter(Boolean)
    .map(String);
}

function describePlatformGame(platform, gameId) {
  const code = getGameCodeForPlatformId(platform, gameId);
  if (code) {
    const game = getGameByCode(code);
    return {
      gameCode: code,
      gameName: game?.a8Name || game?.name || code,
      gameNameEn: game?.nameEn || code,
      a8GameId: game?.a8GameId ?? null,
      inCatalog: true,
    };
  }
  return {
    gameCode: "unknown",
    gameName: `未知(${gameId})`,
    gameNameEn: "Unknown",
    a8GameId: null,
    inCatalog: false,
  };
}

/** Client_GetMatchs 的 Game / GameID（A8 服务端整理后下发，前端直接展示 Game） */
function resolveClientGame(platform, sourceGameId) {
  const info = describePlatformGame(platform, sourceGameId);
  return {
    Game: info.gameName,
    GameID: info.a8GameId ?? 0,
  };
}

function getCatalogSummary() {
  return {
    version: catalog.version,
    updatedAt: catalog.updatedAt,
    activeCodes: parseActiveGameCodes(),
    games: getActiveGames().map((g) => ({
      code: g.code,
      name: g.name,
      nameEn: g.nameEn,
      platformIds: g.platforms,
    })),
  };
}

module.exports = {
  catalog,
  listGames,
  getGameByCode,
  parseActiveGameCodes,
  getActiveGames,
  getPlatformGameId,
  getGameCodeForPlatformId,
  isAllowedPlatformGameId,
  getActivePlatformGameIds,
  describePlatformGame,
  resolveClientGame,
  getCatalogSummary,
};
