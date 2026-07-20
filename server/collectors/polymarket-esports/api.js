/**
 * Polymarket Gamma + CLOB（VPS 直连，不经浏览器插件）
 * 对齐官方：events/keyset、/sports、/sports/market-types、POST /prices side=SELL
 * https://docs.polymarket.com/api-reference/events/list-events-keyset-pagination
 * https://docs.polymarket.com/api-reference/sports/get-sports-metadata-information
 * https://docs.polymarket.com/api-reference/sports/get-valid-sports-market-types
 * https://docs.polymarket.com/api-reference/market-data/get-market-prices-request-body
 *
 * 采集窗：官方 live=true ∪ 开赛 ∈ [now, now+1h]（本地二次滤：开赛 ≤ now+1h，过去不设下限）
 */

import { normalizeEpochMs } from "@changmen/shared/time/match_time";

export const POLYMARKET_GAMMA_API = "https://gamma-api.polymarket.com";
export const POLYMARKET_CLOB_API = "https://clob.polymarket.com";

/** 过去不设下限（进行中可任意久）；仅作兼容导出 */
const COLLECT_PAST_MS = 0;
const COLLECT_FUTURE_MS = 3600 * 1000;
const KEYSET_PAGE_LIMIT = 500;
const MAX_KEYSET_PAGES = 3;
const SPORTS_METADATA_TTL_MS = 60 * 60_000;
const MARKET_TYPES_TTL_MS = 6 * 3600 * 1000;
const ESPORTS_SPORT_KEYS = ["cs2", "lol", "dota2", "hok", "val"];
const DEFAULT_ESPORTS_SERIES_IDS = ["10310", "10311", "10309", "10434", "10369"];

/** 产品主盘；须 ⊆ 官方 GET /sports/market-types */
export const BASE_COLLECT_MARKET_TYPES = ["moneyline", "child_moneyline"];

export const POLYMARKET_COLLECT_PAST_MS = COLLECT_PAST_MS;
export const POLYMARKET_COLLECT_FUTURE_MS = COLLECT_FUTURE_MS;

/** @type {{ ids: string[], expiresAt: number } | null} */
let esportsSeriesCache = null;
/** @type {{ types: Set<string>, expiresAt: number, fromOfficial: boolean } | null} */
let marketTypesCache = null;

/** 开赛 ≤ now+1h（含已开赛进行中）；拒绝更远的未开赛 */
export function polymarketCollectStartTimeAllowed(startMs) {
  const ms = normalizeEpochMs(startMs);
  if (!ms)
    return true;
  return ms <= Date.now() + COLLECT_FUTURE_MS;
}
/** 官方字段规范化；禁止默认 moneyline */
export function normalizeSportsMarketType(market) {
  const raw = market?.sportsMarketType ?? market?.sports_market_type ?? "";
  return String(raw).trim().toLowerCase();
}

function extraMarketTypesFromEnv() {
  const raw = String(process.env.POLYMARKET_COLLECTOR_EXTRA_MARKET_TYPES || "").trim();
  if (!raw)
    return [];
  return raw.split(/[,;\s]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
}

function unwrapArray(data) {
  if (Array.isArray(data))
    return data;
  if (data && typeof data === "object") {
    if (Array.isArray(data.markets))
      return data.markets;
    if (Array.isArray(data.events))
      return data.events;
    if (Array.isArray(data.data))
      return data.data;
    if (Array.isArray(data.marketTypes))
      return data.marketTypes;
  }
  return [];
}

async function fetchJson(url, init) {
  const res = await fetch(url, {
    ...init,
    headers: {
      accept: "application/json",
      ...(init?.headers || {}),
    },
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text.trim() || `HTTP ${res.status} ${url}`);
  }
  return res.json();
}

function marketWithEventContext(market, event) {
  const type = normalizeSportsMarketType(market);
  return {
    ...market,
    gameStartTime: market.gameStartTime ?? event.startTime,
    startDate: market.startDate ?? event.startDate,
    // 勿默认 "moneyline"；只回填已规范化的官方类型（可空）
    ...(type
      ? { sportsMarketType: type, sports_market_type: type }
      : {}),
    tags: market.tags ?? event.tags,
    events: [event],
  };
}

function marketKeyOf(market) {
  return String(market.condition_id ?? market.conditionId ?? market.market ?? market.id ?? "");
}

function nextKeysetCursor(data) {
  if (!data || typeof data !== "object")
    return "";
  return String(data.next_cursor ?? data.nextCursor ?? "");
}

async function fetchEsportsSeriesIds() {
  const now = Date.now();
  if (esportsSeriesCache && esportsSeriesCache.expiresAt > now)
    return esportsSeriesCache.ids;

  try {
    const sports = unwrapArray(await fetchJson(`${POLYMARKET_GAMMA_API}/sports`));
    const ids = sports
      .filter(row => row?.sport && ESPORTS_SPORT_KEYS.includes(String(row.sport)))
      .map(row => String(row.series ?? "").trim())
      .filter(Boolean);
    if (ids.length) {
      esportsSeriesCache = { ids: [...new Set(ids)], expiresAt: now + SPORTS_METADATA_TTL_MS };
      return esportsSeriesCache.ids;
    }
  }
  catch (err) {
    console.warn("[polymarket-esports] sports metadata fallback:", err.message);
  }

  esportsSeriesCache = {
    ids: DEFAULT_ESPORTS_SERIES_IDS,
    expiresAt: now + SPORTS_METADATA_TTL_MS,
  };
  return esportsSeriesCache.ids;
}

/**
 * 产品 allowlist ∩ 官方 /sports/market-types（失败则用 BASE，并打日志）
 * @returns {Promise<Set<string>>}
 */
export async function resolveCollectMarketTypes() {
  const now = Date.now();
  if (marketTypesCache && marketTypesCache.expiresAt > now)
    return marketTypesCache.types;

  const wanted = new Set([
    ...BASE_COLLECT_MARKET_TYPES,
    ...extraMarketTypesFromEnv(),
  ]);

  try {
    const data = await fetchJson(`${POLYMARKET_GAMMA_API}/sports/market-types`);
    const official = new Set(
      unwrapArray(data).map(t => String(t).trim().toLowerCase()).filter(Boolean),
    );
    const intersect = [...wanted].filter(t => official.has(t));
    if (!intersect.length) {
      console.warn(
        "[polymarket-esports] market-types intersect empty; keep BASE",
        { wanted: [...wanted], officialSample: [...official].slice(0, 8) },
      );
      marketTypesCache = {
        types: new Set(BASE_COLLECT_MARKET_TYPES),
        expiresAt: now + MARKET_TYPES_TTL_MS,
        fromOfficial: false,
      };
      return marketTypesCache.types;
    }
    for (const t of wanted) {
      if (!official.has(t))
        console.warn(`[polymarket-esports] market type not in official list: ${t}`);
    }
    marketTypesCache = {
      types: new Set(intersect),
      expiresAt: now + MARKET_TYPES_TTL_MS,
      fromOfficial: true,
    };
    return marketTypesCache.types;
  }
  catch (err) {
    console.warn("[polymarket-esports] market-types fetch failed:", err.message);
    marketTypesCache = {
      types: new Set(BASE_COLLECT_MARKET_TYPES),
      expiresAt: now + 5 * 60_000,
      fromOfficial: false,
    };
    return marketTypesCache.types;
  }
}

/**
 * @param {string[]} seriesIds
 * @param {number} pageLimit
 * @param {Record<string, string>} extraParams
 * @param {Set<string>} seenMarketIds
 * @param {object[]} blocks
 * @returns {Promise<number>} rawEventCount
 */
async function fetchEsportsKeysetPass(seriesIds, pageLimit, extraParams, seenMarketIds, blocks) {
  let cursor = "";
  let rawEventCount = 0;
  for (let page = 0; page < MAX_KEYSET_PAGES; page += 1) {
    const params = new URLSearchParams({
      closed: "false",
      limit: String(pageLimit),
      order: "startTime",
      ascending: "true",
      ...extraParams,
    });
    for (const id of seriesIds)
      params.append("series_id", id);
    if (cursor)
      params.set("after_cursor", cursor);

    const data = await fetchJson(`${POLYMARKET_GAMMA_API}/events/keyset?${params.toString()}`);
    const events = unwrapArray(data);
    rawEventCount += events.length;
    for (const event of events) {
      const markets = Array.isArray(event.markets) ? event.markets : [];
      for (const market of markets) {
        const marketKey = marketKeyOf(market);
        if (marketKey && seenMarketIds.has(marketKey))
          continue;
        if (marketKey)
          seenMarketIds.add(marketKey);
        blocks.push(marketWithEventContext(market, event));
      }
    }
    cursor = nextKeysetCursor(data);
    if (!cursor)
      break;
  }
  return rawEventCount;
}

/**
 * 官方：live 进行中 ∪ 开赛未来 1h 内；去重合并。
 * @returns {Promise<{ markets: object[], rawEventCount: number, rawMarketCount: number }>}
 */
export async function fetchPolymarketEsportsMarkets() {
  const pageLimit = KEYSET_PAGE_LIMIT;
  const blocks = [];
  const seenMarketIds = new Set();
  const seriesIds = await fetchEsportsSeriesIds();
  const now = Date.now();

  const liveEvents = await fetchEsportsKeysetPass(
    seriesIds,
    pageLimit,
    { live: "true" },
    seenMarketIds,
    blocks,
  );
  const upcomingEvents = await fetchEsportsKeysetPass(
    seriesIds,
    pageLimit,
    {
      start_time_min: new Date(now).toISOString(),
      start_time_max: new Date(now + COLLECT_FUTURE_MS).toISOString(),
    },
    seenMarketIds,
    blocks,
  );

  return {
    markets: blocks,
    rawEventCount: liveEvents + upcomingEvents,
    rawMarketCount: blocks.length,
  };
}
/**
 * 官方：买入看 SELL（best ask）。每批 ≤200。
 * @param {string[]} assetIds
 * @returns {Promise<Record<string, number>>}
 */
export async function fetchBatchBuyPrices(assetIds) {
  if (!assetIds.length)
    return {};
  const CHUNK = 200;
  const result = {};
  for (let i = 0; i < assetIds.length; i += CHUNK) {
    const chunk = assetIds.slice(i, i + CHUNK);
    const body = chunk.map(token_id => ({ token_id, side: "SELL" }));
    try {
      const data = await fetchJson(`${POLYMARKET_CLOB_API}/prices`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      for (const [tokenId, sides] of Object.entries(data ?? {})) {
        const price = Number(sides?.SELL ?? 0);
        if (price > 0 && price < 1)
          result[tokenId] = price;
      }
    }
    catch (err) {
      console.warn("[polymarket-esports] /prices chunk failed:", err.message);
    }
  }
  return result;
}

/**
 * 按 SourceMatchID 整场截断：凑不下整场则停，避免同场只剩一半地图盘。
 * @template T
 * @param {T[]} ordered
 * @param {(row: T) => string} matchIdOf
 * @param {number} maxMarkets
 * @returns {T[]}
 */
export function takeWholeMatchesUpTo(ordered, matchIdOf, maxMarkets) {
  const max = Math.max(0, Number(maxMarkets) || 0);
  if (!max || !ordered.length)
    return [];
  /** @type {Map<string, T[]>} */
  const groups = new Map();
  /** @type {string[]} */
  const order = [];
  for (const row of ordered) {
    const sid = String(matchIdOf(row) || "").trim() || "__anon__";
    if (!groups.has(sid)) {
      groups.set(sid, []);
      order.push(sid);
    }
    groups.get(sid).push(row);
  }
  const out = [];
  for (const sid of order) {
    const group = groups.get(sid) || [];
    if (out.length + group.length > max) {
      // 单场本身超过上限：保留该场前 max 盘，避免整轮 candidates 为空误走 skip-clear
      if (out.length === 0 && group.length > max)
        out.push(...group.slice(0, max));
      break;
    }
    out.push(...group);
  }
  return out;
}

/** 测试用 */
export function resetPolymarketEsportsApiCachesForTests() {
  esportsSeriesCache = null;
  marketTypesCache = null;
}
