/**
 * Tennis via Polymarket Gamma（网球只读列表；共用 sport_gamma_fetch）。
 * PM 无单一 tennis key，按联赛 sport 码聚合 series（一期：ATP+WTA 单打）。
 */
import {
  clearSportGammaCache,
  fetchSportAsClientMatchDtos,
} from "./sport_gamma_fetch.js";

/** 一期：ATP / WTA 单打（不含 doubles / ITF） */
const TENNIS_SPORT_KEYS = [
  "atp",
  "wta",
];

/** 与上表对应的 series 兜底（/sports 失败时） */
const TENNIS_DEFAULT_SERIES = [
  "10365", // atp
  "10366", // wta
];

const TENNIS_OPTS = {
  sportKey: TENNIS_SPORT_KEYS,
  gameCode: "tennis",
  defaultSeriesIds: TENNIS_DEFAULT_SERIES,
  idBase: 920_000_000,
  cacheKey: "tennis",
  logTag: "tennisGamma",
};

/** @returns {Promise<object[]>} ClientMatchDto[] */
export async function fetchTennisAsClientMatchDtos() {
  return fetchSportAsClientMatchDtos(TENNIS_OPTS);
}

export function clearTennisMatchCache() {
  clearSportGammaCache("tennis");
}
