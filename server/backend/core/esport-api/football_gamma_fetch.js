/**
 * Soccer via Polymarket Gamma（足球只读列表；共用 sport_gamma_fetch）。
 * PM 无单一 soccer key，按联赛 sport 码聚合 series。
 */
import {
  clearSportGammaCache,
  fetchSportAsClientMatchDtos,
} from "./sport_gamma_fetch.js";

/** 一期：主流联赛 / 欧战 / MLS（可按需加减） */
const FOOTBALL_SPORT_KEYS = [
  "epl",
  "lal",
  "bun",
  "fl1",
  "sea",
  "ucl",
  "uel",
  "mls",
  "ere",
  "por",
  "uef",
  "fif",
  "mex",
  "bra",
  "arg",
  "copa",
];

/** 与上表对应的 series 兜底（/sports 失败时） */
const FOOTBALL_DEFAULT_SERIES = [
  "10188", // epl
  "10193", // lal
  "10194", // bun
  "10204", // ucl
  "10209", // uel
  "10189", // mls
];

const FOOTBALL_OPTS = {
  sportKey: FOOTBALL_SPORT_KEYS,
  gameCode: "soccer",
  defaultSeriesIds: FOOTBALL_DEFAULT_SERIES,
  idBase: 800_000_000,
  cacheKey: "soccer",
  logTag: "footballGamma",
};

/** @returns {Promise<object[]>} ClientMatchDto[] */
export async function fetchFootballAsClientMatchDtos() {
  return fetchSportAsClientMatchDtos(FOOTBALL_OPTS);
}

export function clearFootballMatchCache() {
  clearSportGammaCache("soccer");
}
