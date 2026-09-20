/**
 * Soccer via Polymarket Gamma（足球只读列表；共用 sport_gamma_fetch）。
 * 按 Gamma 父 tag 100350（Soccer）全量拉取，与 PM 官网足球页同口径；
 * 已知联赛挂 changmen 联赛码，其余挂 unknown_fb（前端显示「未分类」）。
 * 解析失败 → unknown_fb（不再默认 uef）。
 */
import {
  clearSportGammaCache,
  fetchSportAsClientMatchDtos,
} from "./sport_gamma_fetch.js";
import {
  FOOTBALL_LEAGUE_CODES,
  FOOTBALL_LIST_FUTURE_MS,
  FOOTBALL_PM_SPORT_ALIASES,
  UNKNOWN_FOOTBALL_GAME,
  footballPmSportFetchKeys,
} from "./sport_football_markets.js";

/** Gamma 父 tag：Soccer（与 PM 官网足球页同一口径） */
const FOOTBALL_GAMMA_TAG_IDS = ["100350"];

const FOOTBALL_GAME_CODES = FOOTBALL_LEAGUE_CODES.filter(c => c !== UNKNOWN_FOOTBALL_GAME);

export const FOOTBALL_OPTS = {
  sportKey: footballPmSportFetchKeys(),
  tagIds: FOOTBALL_GAMMA_TAG_IDS,
  gameCode: UNKNOWN_FOOTBALL_GAME,
  leagueGameCodes: FOOTBALL_GAME_CODES,
  leagueAliases: FOOTBALL_PM_SPORT_ALIASES,
  lineMarkets: true,
  idBase: 800_000_000,
  cacheKey: "soccer6",
  logTag: "footballGamma",
  pastMs: 0,
  futureMs: FOOTBALL_LIST_FUTURE_MS,
  preferUpcoming: true,
  liveBudgetMs: Number(process.env.FOOTBALL_GAMMA_LIVE_BUDGET_MS) || 12_000,
};

/** @returns {Promise<object[]>} ClientMatchDto[] */
export async function fetchFootballAsClientMatchDtos() {
  return fetchSportAsClientMatchDtos(FOOTBALL_OPTS);
}

export function clearFootballMatchCache() {
  clearSportGammaCache("soccer6");
  clearSportGammaCache("soccer");
}
