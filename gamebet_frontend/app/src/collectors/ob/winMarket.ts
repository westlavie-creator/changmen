/**
 * Client_GetMatchs 的 GameID（A8 a8GameId）→ OB 平台 game_id。
 * 主盘 odd_type 映射已随 A8 多盘口采集移除；见 market_catalog.json。
 */
const OB_GAME_ID_BY_A8_GAME_ID: Record<string, string> = {
  "1": "257154660915053",
  "2": "257289795134339",
  "3": "257578064923863",
  "4": "257561197207055",
  "8": "271192272576750",
};

export function obPlatformGameIdFromClientGameId(
  clientGameId: number | string | undefined,
): string | undefined {
  if (clientGameId == null || clientGameId === "") return undefined;
  return OB_GAME_ID_BY_A8_GAME_ID[String(clientGameId)];
}
