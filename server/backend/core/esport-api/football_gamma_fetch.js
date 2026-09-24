import {
  cropSportMatchListWindow,
  FOOTBALL_LEAGUE_CODES,
  FOOTBALL_LIST_FUTURE_MS,
  FOOTBALL_LIST_PAST_MS,
  FOOTBALL_PM_SPORT_ALIASES,
  footballPmSportFetchKeys,
  UNKNOWN_FOOTBALL_GAME,
} from "./sport_football_markets.js";
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
import { readSportListCache } from "./sport_list_cache.js";

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
  pastMs: FOOTBALL_LIST_PAST_MS,
  futureMs: FOOTBALL_LIST_FUTURE_MS,
  preferUpcoming: true,
  liveBudgetMs: Number(process.env.FOOTBALL_GAMMA_LIVE_BUDGET_MS) || 12_000,
};

export const FOOTBALL_CACHE_KEY = FOOTBALL_OPTS.cacheKey;

function envEnabled(name) {
  const value = String(process.env[name] ?? "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "on" || value === "yes";
}

/** 独立 collector 单写模式：backend 只读共享快照，禁止请求内偷偷直连 Gamma。 */
export function readPmFootballCollectorSnapshot() {
  const snapshot = readSportListCache(FOOTBALL_CACHE_KEY);
  if (!snapshot)
    throw new Error("PM football collector snapshot unavailable");
  return cropSportMatchListWindow(
    snapshot.rows,
    FOOTBALL_LIST_PAST_MS,
    FOOTBALL_LIST_FUTURE_MS,
  );
}

/** @returns {Promise<object[]>} ClientMatchDto[] */
export async function fetchFootballAsClientMatchDtos(runtime = {}) {
  if (!runtime.forceRefresh && envEnabled("PM_FOOTBALL_COLLECTOR_OWNED"))
    return readPmFootballCollectorSnapshot();
  return fetchSportAsClientMatchDtos(FOOTBALL_OPTS, runtime);
}

export function clearFootballMatchCache() {
  clearSportGammaCache("soccer6");
  clearSportGammaCache("soccer");
}
