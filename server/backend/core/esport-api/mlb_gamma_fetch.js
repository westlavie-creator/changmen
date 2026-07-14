/**
 * MLB via Polymarket Gamma（棒球只读列表；共用 sport_gamma_fetch）。
 */
import {
  clearSportGammaCache,
  fetchSportAsClientMatchDtos,
} from "./sport_gamma_fetch.js";

const MLB_OPTS = {
  sportKey: "mlb",
  gameCode: "mlb",
  defaultSeriesIds: ["3"],
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
