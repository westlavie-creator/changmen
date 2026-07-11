import { buildFootballMatchesFromEvents, parseJsonArray } from "./parse_football.js";
import { filterSoccerLeagues, leagueFromSportRow, unwrapSportsRows } from "./sport_filter.js";

const POLYMARKET_GAMMA_API = "https://gamma-api.polymarket.com";
const POLYMARKET_CLOB_API = "https://clob.polymarket.com";

const EVENTS_PAGE_LIMIT = 50;
const MAX_EVENT_PAGES = 4;
const LEAGUE_CONCURRENCY = 8;

export const FOOTBALL_PAST_MS = Number(process.env.FOOTBALL_PAST_MS) || 6 * 3600 * 1000;
export const FOOTBALL_FUTURE_MS = Number(process.env.FOOTBALL_FUTURE_MS) || 24 * 3600 * 1000;

async function fetchJson(url, init = {}) {
  const res = await fetch(url, {
    headers: { accept: "application/json", ...(init.headers || {}) },
    signal: AbortSignal.timeout(30_000),
    ...init,
  });
  if (!res.ok)
    throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

function unwrapEvents(data) {
  if (Array.isArray(data))
    return data;
  if (data && typeof data === "object") {
    if (Array.isArray(data.data))
      return data.data;
    if (Array.isArray(data.events))
      return data.events;
  }
  return [];
}

/** @returns {Promise<Array<{ sport: string, name: string, series: string }>>} */
export async function fetchSoccerLeagues() {
  const data = await fetchJson(`${POLYMARKET_GAMMA_API}/sports`);
  return filterSoccerLeagues(unwrapSportsRows(data));
}

/**
 * @param {string} seriesId
 */
async function fetchEventsForSeries(seriesId) {
  const blocks = [];
  for (let page = 0; page < MAX_EVENT_PAGES; page += 1) {
    const params = new URLSearchParams({
      closed: "false",
      limit: String(EVENTS_PAGE_LIMIT),
      series_id: seriesId,
      order: "startDate",
      ascending: "false",
      offset: String(page * EVENTS_PAGE_LIMIT),
    });
    const data = await fetchJson(`${POLYMARKET_GAMMA_API}/events?${params.toString()}`);
    const events = unwrapEvents(data);
    if (!events.length)
      break;
    blocks.push(...events);
    if (events.length < EVENTS_PAGE_LIMIT)
      break;
  }
  return blocks;
}

/**
 * @param {Array<{ sport: string, name: string, series: string }>} leagues
 */
export async function fetchSoccerEvents(leagues) {
  const allEvents = [];
  const seen = new Set();

  for (let i = 0; i < leagues.length; i += LEAGUE_CONCURRENCY) {
    const chunk = leagues.slice(i, i + LEAGUE_CONCURRENCY);
    const batches = await Promise.all(chunk.map(l => fetchEventsForSeries(l.series).catch((err) => {
      console.warn(`[changmen-football] events series=${l.series} (${l.sport}):`, err.message);
      return [];
    })));
    for (const events of batches) {
      for (const event of events) {
        const id = String(event?.id ?? event?.slug ?? "");
        if (!id || seen.has(id))
          continue;
        seen.add(id);
        allEvents.push(event);
      }
    }
  }
  return allEvents;
}

/**
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
      console.warn("[changmen-football] CLOB prices chunk failed:", err.message);
    }
  }
  return result;
}

function collectYesTokenIds(events) {
  const ids = new Set();
  for (const event of events) {
    const markets = Array.isArray(event.markets) ? event.markets : [];
    for (const market of markets) {
      const assetIds = parseJsonArray(market.clob_token_ids ?? market.clobTokenIds);
      const outcomes = parseJsonArray(market.outcomes);
      if (assetIds.length === 2 && outcomes.length === 2) {
        const yesIdx = outcomes.findIndex(o => /^yes$/i.test(String(o).trim()));
        if (yesIdx >= 0)
          ids.add(assetIds[yesIdx]);
      }
    }
  }
  return [...ids];
}

/**
 * @param {Array<Record<string, unknown>>} sportsRows
 */
export function buildSeriesToLeagueMap(sportsRows, leagues) {
  const map = new Map();
  for (const league of leagues) {
    map.set(league.series, league);
    map.set(league.sport, league);
  }
  for (const row of sportsRows) {
    const league = leagueFromSportRow(row);
    if (league.series)
      map.set(league.series, league);
    if (league.sport)
      map.set(league.sport, league);
  }
  return map;
}

export async function refreshFootballData() {
  const sportsData = await fetchJson(`${POLYMARKET_GAMMA_API}/sports`);
  const sportsRows = unwrapSportsRows(sportsData);
  const leagues = filterSoccerLeagues(sportsRows);
  const events = await fetchSoccerEvents(leagues);
  const assetIds = collectYesTokenIds(events);
  const buyPrices = await fetchBatchBuyPrices(assetIds);
  const seriesToLeague = buildSeriesToLeagueMap(sportsRows, leagues);
  const matches = buildFootballMatchesFromEvents(events, seriesToLeague, buyPrices, {
    pastMs: FOOTBALL_PAST_MS,
    futureMs: FOOTBALL_FUTURE_MS,
  });
  return { matches, leagues };
}
