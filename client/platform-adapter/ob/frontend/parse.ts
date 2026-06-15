/** OB 前端 parse 入口：字段解析在 shared/parse_fields，回传策略在 shared/save_bets */

export { num, parseObOddField, obBlockLabel } from "../shared/parse_fields";
export { compileObBetNameRe as getObBetNameRe } from "../shared/save_bets";
export { obLegacyWinBetName as obMainWinBetLabel } from "@changmen/shared/catalog/market_catalog.browser";

/**
 * Client_GetMatchs �?GameID（A8 a8GameId）→ OB 平台 game_id�? * 主盘选盘优先 odd_type_id（gameOddTypes），�?packages/shared/catalog/market_catalog.json�? */
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
