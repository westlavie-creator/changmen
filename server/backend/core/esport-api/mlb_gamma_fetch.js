/**
 * Baseball via Polymarket Gamma（棒球只读列表；共用 sport_gamma_fetch）。
 * 一期练手：MLB + KBO + NPB（不含 jap——Gamma 上 jap=日职足球）。
 */
import {
  clearSportGammaCache,
  fetchSportAsClientMatchDtos,
} from "./sport_gamma_fetch.js";

const BASEBALL_SPORT_KEYS = [
  "mlb",
  "kbo",
  "npb",
];

/** 与上表对应的 series 兜底（/sports 失败时） */
const BASEBALL_DEFAULT_SERIES = [
  "3", // mlb
  "10370", // kbo
  "11968", // npb
];

const MLB_OPTS = {
  sportKey: BASEBALL_SPORT_KEYS,
  gameCode: "mlb",
  leagueGameCodes: BASEBALL_SPORT_KEYS,
  defaultSeriesIds: BASEBALL_DEFAULT_SERIES,
  idBase: 900_000_000,
  cacheKey: "mlb",
  logTag: "mlbGamma",
};

/** @returns {Promise<object[]>} ClientMatchDto[] */
export async function fetchMlbAsClientMatchDtos() {
  return fetchSportAsClientMatchDtos(MLB_OPTS);
}

export function clearMlbMatchCache() {
  clearSportGammaCache("mlb");
}
