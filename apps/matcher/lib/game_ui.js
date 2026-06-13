import { describePlatformGame, getGameCodeForPlatformId } from "@changmen/shared/catalog/game_catalog.mjs";

/** matcher UI：平台 source_game_id → { code, name }，未知游戏返回 null */
export function resolveUiGame(platform, sourceGameId) {
  const info = describePlatformGame(platform, sourceGameId);
  if (!info.inCatalog) return null;
  return { code: info.gameCode, name: info.gameName };
}

export { getGameCodeForPlatformId };
