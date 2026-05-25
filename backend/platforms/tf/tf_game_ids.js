"use strict";

const catalog = require("./tf_game_ids.json");

function getGameRecord(gameId) {
  return catalog.games[String(gameId)] || null;
}

function getGameName(gameId) {
  const rec = getGameRecord(gameId);
  if (rec?.name) return rec.name;
  return `未知(${gameId})`;
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
