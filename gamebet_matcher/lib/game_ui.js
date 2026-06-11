"use strict";

const { describePlatformGame, getGameCodeForPlatformId } = require("../../shared/catalog/game_catalog");

/** matcher UI：平台 source_game_id → { code, name }，未知游戏返回 null */
function resolveUiGame(platform, sourceGameId) {
  const info = describePlatformGame(platform, sourceGameId);
  if (!info.inCatalog) return null;
  return { code: info.gameCode, name: info.gameName };
}

module.exports = { resolveUiGame, getGameCodeForPlatformId };
