/**
 * Soccer via Polymarket Gamma（足球只读列表；共用 sport_gamma_fetch）。
 * PM 无单一 soccer key，按联赛 sport 码聚合 series；Game=changmen 联赛码。
 * 解析失败 → unknown_fb（不再默认 uef）。
 */
import {
  clearSportGammaCache,
  fetchSportAsClientMatchDtos,
} from "./sport_gamma_fetch.js";
import {
  FOOTBALL_LEAGUE_CODES,
  FOOTBALL_PM_SPORT_ALIASES,
  UNKNOWN_FOOTBALL_GAME,
  footballPmSportFetchKeys,
} from "./sport_football_markets.js";

/** 与联赛表对应的 series 兜底（/sports 失败时；与 Gamma /sports sport→series 对齐） */
const FOOTBALL_DEFAULT_SERIES = [
  "10188", // epl
  "10193", // lal
  "10194", // bun
  "10195", // fl1
  "10203", // sea
  "10204", // ucl
  "10209", // uel
  "10437", // uecl (PM col)
  "10189", // mls
  "10286", // ere
  "10330", // por
  "10243", // uef
  "10238", // fif
  "10290", // mex
  "10359", // bra
  "10285", // arg
  "10671", // copa
  "10360", // jap
  "10241", // afc
  "10240", // caf
  "10439", // chi
  "11880", // chi2
];

const FOOTBALL_GAME_CODES = FOOTBALL_LEAGUE_CODES.filter(c => c !== UNKNOWN_FOOTBALL_GAME);

const FOOTBALL_OPTS = {
  sportKey: footballPmSportFetchKeys(),
  gameCode: UNKNOWN_FOOTBALL_GAME,
  leagueGameCodes: FOOTBALL_GAME_CODES,
  leagueAliases: FOOTBALL_PM_SPORT_ALIASES,
  lineMarkets: true,
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
