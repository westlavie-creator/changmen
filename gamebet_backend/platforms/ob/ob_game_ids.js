"use strict";

const catalog = require("./data/ob_game_ids.json");

function getGameRecord(gameId) {
  return catalog.games[String(gameId)] || null;
}

function getGameName(gameId) {
  const rec = getGameRecord(gameId);
  if (rec?.name && rec.name !== "待确认") return rec.name;
  return rec?.name || `未知(${gameId})`;
}

function getGameCode(gameId) {
  return getGameRecord(gameId)?.code || "unknown";
}

function listKnownGames() {
  return Object.entries(catalog.games).map(([id, g]) => ({
    gameId: id,
    ...g,
  }));
}

module.exports = {
  catalog,
  getGameRecord,
  getGameName,
  getGameCode,
  listKnownGames,
};
