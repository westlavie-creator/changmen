import type { PolymarketBook, PolymarketRawEvent, PolymarketRawMarket } from "./parse";
import { polymarketPluginGet } from "./transport";

export const POLYMARKET_GAMMA_API = "https://gamma-api.polymarket.com";
export const POLYMARKET_CLOB_API = "https://clob.polymarket.com";
export const POLYMARKET_MARKET_WS = "wss://ws-subscriptions-clob.polymarket.com/ws/market";

const DEFAULT_MARKET_LIMIT = 200;
const KEYSET_PAGE_LIMIT = 500;
const MAX_KEYSET_PAGES = 3;
const SPORTS_METADATA_TTL_MS = 60 * 60_000;
const COLLECT_PAST_MS = 12 * 3600 * 1000;
const COLLECT_FUTURE_MS = 3600 * 1000;
const ESPORTS_SPORT_KEYS = ["cs2", "lol", "dota2", "hok", "val"];
const DEFAULT_ESPORTS_SERIES_IDS = ["10310", "10311", "10309", "10434", "10369"];

interface PolymarketSportsMetadata {
  sport?: string;
  series?: string | number;
}

interface PolymarketKeysetResponse {
  data?: PolymarketRawEvent[];
  events?: PolymarketRawEvent[];
  next_cursor?: string | null;
  nextCursor?: string | null;
}

let esportsSeriesCache: { ids: string[]; expiresAt: number } | null = null;

function unwrapArray<T>(data: unknown): T[] {
  if (Array.isArray(data))
    return data as T[];
  const wrapped = data as { markets?: unknown; events?: unknown; data?: unknown };
  if (Array.isArray(wrapped.markets))
    return wrapped.markets as T[];
  if (Array.isArray(wrapped.events))
    return wrapped.events as T[];
  if (Array.isArray(wrapped.data))
    return wrapped.data as T[];
  return [];
}

function marketWithEventContext(market: PolymarketRawMarket, event: PolymarketRawEvent): PolymarketRawMarket {
  return {
    ...market,
    gameStartTime: market.gameStartTime ?? event.startTime,
    startDate: market.startDate ?? event.startDate,
    sportsMarketType: market.sportsMarketType ?? "moneyline",
    tags: market.tags ?? event.tags,
    events: [event],
  };
}

function marketKeyOf(market: PolymarketRawMarket): string {
  return String(market.condition_id ?? market.conditionId ?? market.market ?? market.id ?? "");
}

function keysetEvents(data: unknown): PolymarketRawEvent[] {
  return unwrapArray<PolymarketRawEvent>(data);
}

function nextKeysetCursor(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const wrapped = data as PolymarketKeysetResponse;
  return String(wrapped.next_cursor ?? wrapped.nextCursor ?? "");
}

async function fetchEsportsSeriesIds(): Promise<string[]> {
  const now = Date.now();
  if (esportsSeriesCache && esportsSeriesCache.expiresAt > now) return esportsSeriesCache.ids;

  try {
    const data = await polymarketPluginGet<unknown>(`${POLYMARKET_GAMMA_API}/sports`);
    const sports = unwrapArray<PolymarketSportsMetadata>(data);
    const ids = sports
      .filter(row => row.sport && ESPORTS_SPORT_KEYS.includes(String(row.sport)))
      .map(row => String(row.series ?? "").trim())
      .filter(Boolean);
    if (ids.length) {
      esportsSeriesCache = { ids: [...new Set(ids)], expiresAt: now + SPORTS_METADATA_TTL_MS };
      return esportsSeriesCache.ids;
    }
  } catch (err) {
    console.warn("[Polymarket] sports metadata fallback", err);
  }

  esportsSeriesCache = { ids: DEFAULT_ESPORTS_SERIES_IDS, expiresAt: now + SPORTS_METADATA_TTL_MS };
  return esportsSeriesCache.ids;
}

export async function fetchPolymarketMarkets(limit = DEFAULT_MARKET_LIMIT): Promise<PolymarketRawMarket[]> {
  const params = new URLSearchParams({
    active: "true",
    closed: "false",
    archived: "false",
    limit: String(limit),
    order: "volume",
    ascending: "false",
  });
  const data = await polymarketPluginGet<unknown>(`${POLYMARKET_GAMMA_API}/markets?${params.toString()}`);
  return unwrapArray<PolymarketRawMarket>(data);
}

export async function fetchPolymarketEsportsMarkets(limit = DEFAULT_MARKET_LIMIT): Promise<PolymarketRawMarket[]> {
  const pageLimit = Math.min(KEYSET_PAGE_LIMIT, Math.max(100, limit));
  const blocks: PolymarketRawMarket[] = [];
  const seenMarketIds = new Set<string>();
  const seriesIds = await fetchEsportsSeriesIds();
  let cursor = "";

  for (let page = 0; page < MAX_KEYSET_PAGES; page += 1) {
    const now = Date.now();
    const params = new URLSearchParams({
      closed: "false",
      limit: String(pageLimit),
      order: "startTime",
      ascending: "true",
      start_time_min: new Date(now - COLLECT_PAST_MS).toISOString(),
      start_time_max: new Date(now + COLLECT_FUTURE_MS).toISOString(),
    });
    for (const id of seriesIds) params.append("series_id", id);
    if (cursor) params.set("after_cursor", cursor);

    const data = await polymarketPluginGet<unknown>(`${POLYMARKET_GAMMA_API}/events/keyset?${params.toString()}`);
    const events = keysetEvents(data);
    for (const event of events) {
      const markets = Array.isArray(event.markets) ? event.markets : [];
      for (const market of markets) {
        const marketKey = marketKeyOf(market);
        if (marketKey && seenMarketIds.has(marketKey)) continue;
        if (marketKey) seenMarketIds.add(marketKey);
        blocks.push(marketWithEventContext(market, event));
      }
    }
    cursor = nextKeysetCursor(data);
    if (!cursor) break;
  }
  return blocks;
}

export async function fetchPolymarketBook(assetId: string): Promise<PolymarketBook | null> {
  if (!assetId)
    return null;
  const params = new URLSearchParams({ token_id: assetId });
  const data = await polymarketPluginGet<PolymarketBook | { book?: PolymarketBook }>(
    `${POLYMARKET_CLOB_API}/book?${params.toString()}`,
  );
  if (!data)
    return null;
  if ("book" in data && data.book)
    return data.book;
  return data as PolymarketBook;
}

export interface PolymarketWsMessage {
  event_type?: string;
  asset_id?: string;
  market?: string;
  best_ask?: string;
  price_changes?: Array<{
    asset_id?: string;
    best_ask?: string;
    price?: string;
    size?: string;
  }>;
}

export function polymarketMarketSubscribeMessage(assetIds: string[]): string {
  return JSON.stringify({
    assets_ids: assetIds,
    type: "market",
    custom_feature_enabled: true,
  });
}
