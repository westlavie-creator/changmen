/**
 * Basketball via Polymarket Gamma（篮球只读列表；共用 sport_gamma_fetch）。
 * 一期：NBA（series 兜底 10345）。
 */
import {
  clearSportGammaCache,
  fetchSportAsClientMatchDtos,
} from "./sport_gamma_fetch.js";

const BASKETBALL_SPORT_KEYS = [
  "nba",
];

/** 与上表对应的 series 兜底（/sports 失败时）；NBA=10345 */
const BASKETBALL_DEFAULT_SERIES = [
  "10345",
];

const NBA_OPTS = {
  sportKey: BASKETBALL_SPORT_KEYS,
  gameCode: "nba",
  leagueGameCodes: BASKETBALL_SPORT_KEYS,
  defaultSeriesIds: BASKETBALL_DEFAULT_SERIES,
  idBase: 940_000_000,
  cacheKey: "nba",
  logTag: "nbaGamma",
};

/** @returns {Promise<object[]>} ClientMatchDto[] */
export async function fetchNbaAsClientMatchDtos() {
  return fetchSportAsClientMatchDtos(NBA_OPTS);
}

export function clearNbaMatchCache() {
  clearSportGammaCache("nba");
}
