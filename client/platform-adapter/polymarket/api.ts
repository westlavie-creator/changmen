import type { PolymarketBook, PolymarketRawEvent, PolymarketRawMarket } from "./parse";
import { directGet } from "@/shared/http";

export const POLYMARKET_GAMMA_API = "https://gamma-api.polymarket.com";
export const POLYMARKET_CLOB_API = "https://clob.polymarket.com";
export const POLYMARKET_MARKET_WS = "wss://ws-subscriptions-clob.polymarket.com/ws/market";

const DEFAULT_MARKET_LIMIT = 200;
const ESPORTS_SERIES_SLUGS = [
  "counter-strike",
  "league-of-legends",
  "dota-2",
  "honor-of-kings",
  "valorant",
];

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

export async function fetchPolymarketMarkets(limit = DEFAULT_MARKET_LIMIT): Promise<PolymarketRawMarket[]> {
  const params = new URLSearchParams({
    active: "true",
    closed: "false",
    archived: "false",
    limit: String(limit),
    order: "volume",
    ascending: "false",
  });
  const data = await directGet<unknown>(`${POLYMARKET_GAMMA_API}/markets?${params.toString()}`, {});
  return unwrapArray<PolymarketRawMarket>(data);
}

export async function fetchPolymarketEsportsMarkets(limit = DEFAULT_MARKET_LIMIT): Promise<PolymarketRawMarket[]> {
  const perSeriesLimit = Math.max(20, Math.ceil(limit / ESPORTS_SERIES_SLUGS.length));
  const blocks = await Promise.all(ESPORTS_SERIES_SLUGS.map(async (seriesSlug) => {
    const params = new URLSearchParams({
      active: "true",
      closed: "false",
      archived: "false",
      limit: String(perSeriesLimit),
      series_slug: seriesSlug,
    });
    const data = await directGet<unknown>(`${POLYMARKET_GAMMA_API}/events?${params.toString()}`, {});
    const events = unwrapArray<PolymarketRawEvent>(data);
    return events.flatMap((event) => {
      const markets = Array.isArray(event.markets) ? event.markets : [];
      return markets.map(market => marketWithEventContext(market, event));
    });
  }));
  return blocks.flat();
}

export async function fetchPolymarketBook(assetId: string): Promise<PolymarketBook | null> {
  if (!assetId)
    return null;
  const params = new URLSearchParams({ token_id: assetId });
  const data = await directGet<PolymarketBook | { book?: PolymarketBook }>(
    `${POLYMARKET_CLOB_API}/book?${params.toString()}`,
    {},
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
