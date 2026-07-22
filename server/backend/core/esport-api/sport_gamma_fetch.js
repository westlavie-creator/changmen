/**
 * Polymarket Gamma → ClientMatchDto[]（多运动只读列表共用）。
 * 不写电竞 client_matches；不做跨站匹配。
 * 缓存：进程内存 + storage/sport/{key}/（见 sport_list_cache.js）。
 */

import {
  readFreshSportListCache,
  readSportListCache,
  writeSportListCache,
} from "./sport_list_cache.js";

const GAMMA_BASE = process.env.POLYMARKET_GAMMA_BASE || "https://gamma-api.polymarket.com";
const CLOB_BASE = process.env.POLYMARKET_CLOB_BASE || "https://clob.polymarket.com";

const KEYSET_PAGE_LIMIT = 200;
const MAX_KEYSET_PAGES = 5;
const PAST_MS = 24 * 3600 * 1000;
const FUTURE_MS = 7 * 24 * 3600 * 1000;
const CACHE_TTL_MS = 30_000;

/** @type {Map<string, { at: number, rows: object[] }>} */
const _caches = new Map();

/**
 * @typedef {object} SportGammaOptions
 * @property {string|string[]} sportKey Gamma /sports 的 sport 字段（可多联赛，如 epl+lal）
 * @property {string} gameCode ClientMatchDto.Game（如 mlb、soccer）
 * @property {string[]} [defaultSeriesIds] /sports 失败时的 fallback series_id
 * @property {number} [idBase] stableMatchId 基数，与电竞/其他运动错开
 * @property {string} [cacheKey] 进程内缓存键，默认 sportKey
 * @property {string} [logTag]
 * @property {string[]} [leagueGameCodes] 若设，用 event.sport.sport 等覆盖 Game（棒球 mlb|kbo|npb）
 */

function parseJsonArray(value) {
  if (Array.isArray(value))
    return value.map(String).filter(Boolean);
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed)
      return [];
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
    }
    catch {
      return [];
    }
  }
  return [];
}

function decimalOddsFromProbability(price) {
  const value = Number(price);
  if (!Number.isFinite(value) || value <= 0 || value >= 1)
    return 0;
  return Math.round((1 / value) * 1000) / 1000;
}

function startTimeMsOf(event) {
  const raw = event.startTime ?? event.startDate;
  if (raw === undefined || raw === null || raw === "")
    return Date.now();
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 0)
    return numeric > 1e12 ? numeric : numeric * 1000;
  const parsed = Date.parse(String(raw));
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function marketTypeOf(market) {
  return String(market.sportsMarketType ?? market.sports_market_type ?? "").toLowerCase();
}

function isOpenMarket(market) {
  if (market.active === false)
    return false;
  if (market.closed)
    return false;
  if (market.accepting_orders === false || market.acceptingOrders === false)
    return false;
  return true;
}

function unwrapEvents(data) {
  if (Array.isArray(data))
    return data;
  if (Array.isArray(data?.data))
    return data.data;
  if (Array.isArray(data?.events))
    return data.events;
  return [];
}

function nextCursor(data) {
  if (!data || typeof data !== "object")
    return "";
  return String(data.next_cursor ?? data.nextCursor ?? "");
}

async function gammaGet(path) {
  const response = await fetch(`${GAMMA_BASE}${path}`);
  if (!response.ok)
    throw new Error(`Gamma ${response.status}: ${path}`);
  return response.json();
}

/**
 * @param {string[]} sportKeys
 * @param {string[]} defaultSeriesIds
 * @param {string} logTag
 */
async function fetchSeriesIds(sportKeys, defaultSeriesIds, logTag) {
  const want = new Set(sportKeys.map(k => k.toLowerCase()).filter(Boolean));
  if (!want.size)
    return defaultSeriesIds.length ? defaultSeriesIds : [];
  try {
    const sports = await gammaGet("/sports");
    const ids = (Array.isArray(sports) ? sports : [])
      .filter(row => want.has(String(row.sport ?? "").toLowerCase()))
      .map(row => String(row.series ?? "").trim())
      .filter(Boolean);
    if (ids.length)
      return [...new Set(ids)];
  }
  catch (err) {
    console.warn(`[${logTag}] /sports fallback`, err?.message || err);
  }
  return defaultSeriesIds.length ? defaultSeriesIds : [];
}

async function fetchBatchBuyPrices(assetIds) {
  if (!assetIds.length)
    return {};
  const body = assetIds.map(token_id => ({ token_id, side: "SELL" }));
  const response = await fetch(`${CLOB_BASE}/prices`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok)
    return {};
  const data = await response.json();
  const result = {};
  for (const [tokenId, sides] of Object.entries(data ?? {})) {
    const price = Number(sides?.SELL ?? 0);
    if (price > 0 && price < 1)
      result[tokenId] = price;
  }
  return result;
}

/**
 * @param {string} key
 * @param {number} idBase
 */
function stableMatchId(key, idBase) {
  let h = 0;
  const s = String(key);
  for (let i = 0; i < s.length; i += 1)
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  const n = Math.abs(h) || 1;
  return idBase + (n % 99_000_000);
}

function splitTitleTeams(title) {
  let text = String(title || "").trim();
  // 去掉联赛前缀，避免 HomeName 变成 "KBO: NC Dinos"
  text = text.replace(/^(kbo|npb|mlb)(?:\s+playoffs?)?\s*:\s*/i, "");
  const parts = text.split(/\s+vs\.?\s+/i);
  if (parts.length >= 2)
    return { home: parts[0].trim(), away: parts.slice(1).join(" vs ").trim() };
  const at = text.split(/\s+@\s+/);
  if (at.length === 2)
    return { home: at[1].trim(), away: at[0].trim() };
  return { home: text || "Home", away: "Away" };
}

/**
 * 棒球等多联赛：用 Gamma event.sport.sport / seriesSlug 作为 Game（mlb|kbo|npb）。
 * @param {object} raw
 * @param {string} fallbackGame
 * @param {string[]} [leagueGameCodes]
 */
function resolveEventGameCode(raw, fallbackGame, leagueGameCodes) {
  const allow = new Set((leagueGameCodes || []).map(k => String(k).toLowerCase()).filter(Boolean));
  if (!allow.size)
    return fallbackGame;
  const fromSport = String(raw?.sport?.sport ?? "").toLowerCase().trim();
  if (fromSport && allow.has(fromSport))
    return fromSport;
  const fromSlug = String(raw?.seriesSlug ?? "").toLowerCase().trim();
  if (fromSlug && allow.has(fromSlug))
    return fromSlug;
  const series = Array.isArray(raw?.series) ? raw.series : [];
  for (const row of series) {
    const tick = String(row?.ticker ?? row?.slug ?? "").toLowerCase().trim();
    if (tick && allow.has(tick))
      return tick;
  }
  return fallbackGame;
}

/**
 * @param {SportGammaOptions} options
 * @returns {Promise<object[]>} ClientMatchDto[]
 */
export async function fetchSportAsClientMatchDtos(options) {
  const sportKeys = (Array.isArray(options.sportKey)
    ? options.sportKey
    : [options.sportKey]
  ).map(k => String(k || "").toLowerCase()).filter(Boolean);
  const gameCode = String(options.gameCode || sportKeys[0] || "sport");
  const defaultSeriesIds = (options.defaultSeriesIds || []).map(String).filter(Boolean);
  const idBase = Number(options.idBase) || 900_000_000;
  const cacheKey = String(options.cacheKey || sportKeys.join("+") || "sport");
  const logTag = String(options.logTag || `sportGamma:${cacheKey}`);
  const leagueGameCodes = Array.isArray(options.leagueGameCodes)
    ? options.leagueGameCodes.map(k => String(k || "").toLowerCase()).filter(Boolean)
    : [];

  const mem = _caches.get(cacheKey);
  if (mem && Date.now() - mem.at < CACHE_TTL_MS)
    return mem.rows;

  const diskFresh = readFreshSportListCache(cacheKey);
  if (diskFresh) {
    _caches.set(cacheKey, { at: diskFresh.at, rows: diskFresh.rows });
    return diskFresh.rows;
  }

  try {
    const rows = await fetchSportRowsFromGamma({
      sportKeys,
      gameCode,
      defaultSeriesIds,
      idBase,
      logTag,
      leagueGameCodes,
    });
    const at = Date.now();
    _caches.set(cacheKey, { at, rows });
    try {
      writeSportListCache(cacheKey, rows, at);
    }
    catch (err) {
      console.warn(`[${logTag}] disk write skipped`, err?.message || err);
    }
    return rows;
  }
  catch (err) {
    const diskAny = readSportListCache(cacheKey);
    if (diskAny?.rows?.length) {
      console.warn(`[${logTag}] gamma failed, serving stale disk cache`, err?.message || err);
      _caches.set(cacheKey, { at: diskAny.at, rows: diskAny.rows });
      return diskAny.rows;
    }
    throw err;
  }
}

/**
 * @param {{ sportKeys: string[], gameCode: string, defaultSeriesIds: string[], idBase: number, logTag: string, leagueGameCodes?: string[] }} opts
 */
async function fetchSportRowsFromGamma(opts) {
  const { sportKeys, gameCode, defaultSeriesIds, idBase, logTag, leagueGameCodes } = opts;

  const seriesIds = await fetchSeriesIds(sportKeys, defaultSeriesIds, logTag);
  if (!seriesIds.length) {
    throw new Error(
      `[${logTag}] 无可用 Gamma series（sportKey=${sportKeys.join(",") || "?"}；请检查 /sports 或 defaultSeriesIds）`,
    );
  }

  const now = Date.now();
  /** @type {object[]} */
  const events = [];
  let cursor = "";

  for (let page = 0; page < MAX_KEYSET_PAGES; page += 1) {
    const params = new URLSearchParams({
      closed: "false",
      limit: String(KEYSET_PAGE_LIMIT),
      order: "startTime",
      ascending: "true",
      start_time_min: new Date(now - PAST_MS).toISOString(),
      start_time_max: new Date(now + FUTURE_MS).toISOString(),
    });
    for (const id of seriesIds)
      params.append("series_id", id);
    if (cursor)
      params.set("after_cursor", cursor);

    const data = await gammaGet(`/events/keyset?${params.toString()}`);
    for (const raw of unwrapEvents(data)) {
      const title = String(raw.title ?? "").trim();
      if (!title)
        continue;
      if (/\b(halftime|half[\s-]?time|1st half|2nd half|second half|map\s*\d|period\s*\d)\b/i.test(title))
        continue;
      const openMarkets = (raw.markets ?? []).filter(isOpenMarket);
      let moneyline = null;
      for (const market of openMarkets) {
        if (marketTypeOf(market) !== "moneyline")
          continue;
        const outcomes = parseJsonArray(market.outcomes);
        const prices = parseJsonArray(market.outcomePrices ?? market.outcome_prices);
        const tokenIds = parseJsonArray(market.clobTokenIds ?? market.clob_token_ids);
        if (outcomes.length < 2)
          continue;
        moneyline = { outcomes, prices, tokenIds };
        break;
      }
      if (!moneyline)
        continue;
      events.push({
        id: String(raw.id ?? raw.slug ?? title),
        title,
        slug: String(raw.slug ?? ""),
        startTimeMs: startTimeMsOf(raw),
        moneyline,
        game: resolveEventGameCode(raw, gameCode, leagueGameCodes),
      });
    }
    cursor = nextCursor(data);
    if (!cursor)
      break;
  }

  events.sort((a, b) => a.startTimeMs - b.startTimeMs);

  const tokenIds = [];
  for (const ev of events) {
    if (!ev.moneyline)
      continue;
    for (const tid of ev.moneyline.tokenIds) {
      if (tid)
        tokenIds.push(tid);
    }
  }
  const livePrices = tokenIds.length
    ? await fetchBatchBuyPrices([...new Set(tokenIds)].slice(0, 200))
    : {};

  return events.map((ev) => {
    const { home, away } = splitTitleTeams(ev.title);
    const ml = ev.moneyline;
    let homeOdds = 0;
    let awayOdds = 0;
    let homeToken = "";
    let awayToken = "";
    if (ml) {
      const p0 = livePrices[ml.tokenIds[0]] ?? Number(ml.prices[0] ?? 0);
      const p1 = livePrices[ml.tokenIds[1]] ?? Number(ml.prices[1] ?? 0);
      homeOdds = decimalOddsFromProbability(p0);
      awayOdds = decimalOddsFromProbability(p1);
      homeToken = ml.tokenIds[0] || "";
      awayToken = ml.tokenIds[1] || "";
      const o0 = String(ml.outcomes[0] ?? "").toLowerCase();
      const o1 = String(ml.outcomes[1] ?? "").toLowerCase();
      const homeL = home.toLowerCase();
      if (o1 && homeL && (homeL.includes(o1) || o1.includes(homeL.split(" ").pop() || ""))) {
        homeOdds = decimalOddsFromProbability(p1);
        awayOdds = decimalOddsFromProbability(p0);
        homeToken = ml.tokenIds[1] || "";
        awayToken = ml.tokenIds[0] || "";
      }
      else if (o0 && away.toLowerCase().includes(o0.split(" ").pop() || "___")) {
        /* keep default order */
      }
    }

    const matchId = stableMatchId(ev.id, idBase);
    const betId = matchId * 10 + 1;
    return {
      ID: matchId,
      Title: ev.title,
      Game: ev.game || gameCode,
      GameID: 0,
      StartTime: ev.startTimeMs,
      Matchs: {
        Polymarket: ev.id,
      },
      Bets: [{
        ID: betId,
        MatchID: matchId,
        Map: 0,
        Name: "Moneyline",
        HomeID: betId * 10 + 1,
        HomeName: home,
        AwayID: betId * 10 + 2,
        AwayName: away,
        Sources: {
          Polymarket: {
            Type: "Polymarket",
            BetID: homeToken || String(ev.id),
            HomeID: homeToken || `${ev.id}-home`,
            AwayID: awayToken || `${ev.id}-away`,
            HomeOdds: homeOdds,
            AwayOdds: awayOdds,
            Status: "Normal",
          },
        },
      }],
    };
  });
}

/** @param {string} [cacheKey] */
export function clearSportGammaCache(cacheKey) {
  if (cacheKey)
    _caches.delete(cacheKey);
  else
    _caches.clear();
}
