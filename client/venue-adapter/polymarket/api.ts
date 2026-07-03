import type { PolymarketBook, PolymarketRawEvent, PolymarketRawMarket } from "./parse";
import { normalizeEpochMs } from "@changmen/shared/time/match_time";
import { polymarketPluginGet, polymarketPluginPost } from "./transport";

export const POLYMARKET_GAMMA_API = "https://gamma-api.polymarket.com";
export const POLYMARKET_CLOB_API = "https://clob.polymarket.com";
export const POLYMARKET_MARKET_WS = "wss://ws-subscriptions-clob.polymarket.com/ws/market";
export const POLYMARKET_SPORTS_WS = "wss://sports-api.polymarket.com/ws";

const DEFAULT_MARKET_LIMIT = 200;
const KEYSET_PAGE_LIMIT = 500;
const MAX_KEYSET_PAGES = 3;
const SPORTS_METADATA_TTL_MS = 60 * 60_000;
const COLLECT_PAST_MS = 6 * 3600 * 1000;
const COLLECT_FUTURE_MS = 3600 * 1000;

/** [changmen 扩展] Polymarket 采集开赛窗：过去 6h、未来 1h（A8 无此场馆；其它平台仅未来 1h 上限） */
export const POLYMARKET_COLLECT_PAST_MS = COLLECT_PAST_MS;
export const POLYMARKET_COLLECT_FUTURE_MS = COLLECT_FUTURE_MS;

export function polymarketCollectStartTimeAllowed(startMs: number): boolean {
  const ms = normalizeEpochMs(startMs);
  if (!ms)
    return true;
  const now = Date.now();
  return ms >= now - COLLECT_PAST_MS && ms <= now + COLLECT_FUTURE_MS;
}

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

/**
 * 批量获取 token 的买入成本价（best_ask），替代逐个调用 /book。
 * CLOB /prices side=SELL 返回 best_ask（卖方最低报价 = 买方实际支付价）。
 * 每批最多 200 个 token，超出自动分块。
 * 返回 Record<assetId, probability>，缺失的 assetId 不在结果中（市场将显示 Locked）。
 */
/**
 * 批量获取 token 的卖出价（best_bid），市价卖单吃 bids。
 * CLOB /prices side=BUY 返回 best_bid（买方最高报价 = 卖方实际收到价）。
 */
export async function fetchBatchSellPrices(assetIds: string[]): Promise<Record<string, number>> {
  if (!assetIds.length)
    return {};
  const CHUNK = 200;
  const result: Record<string, number> = {};
  for (let i = 0; i < assetIds.length; i += CHUNK) {
    const chunk = assetIds.slice(i, i + CHUNK);
    const body = chunk.map(token_id => ({ token_id, side: "BUY" }));
    try {
      const data = await polymarketPluginPost<Record<string, Record<string, unknown>>>(
        `${POLYMARKET_CLOB_API}/prices`,
        body,
      );
      for (const [tokenId, sides] of Object.entries(data ?? {})) {
        const price = Number(sides?.BUY ?? 0);
        if (price > 0 && price < 1)
          result[tokenId] = price;
      }
    }
    catch {
      // 分块失败不阻断其余分块
    }
  }
  return result;
}

export async function fetchBatchBuyPrices(assetIds: string[]): Promise<Record<string, number>> {
  if (!assetIds.length)
    return {};
  const CHUNK = 200;
  const result: Record<string, number> = {};
  for (let i = 0; i < assetIds.length; i += CHUNK) {
    const chunk = assetIds.slice(i, i + CHUNK);
    const body = chunk.map(token_id => ({ token_id, side: "SELL" }));
    try {
      const data = await polymarketPluginPost<Record<string, Record<string, unknown>>>(
        `${POLYMARKET_CLOB_API}/prices`,
        body,
      );
      for (const [tokenId, sides] of Object.entries(data ?? {})) {
        const price = Number(sides?.SELL ?? 0);
        if (price > 0 && price < 1)
          result[tokenId] = price;
      }
    }
    catch {
      // 分块失败不阻断其余分块；缺失的 token 保持 Locked
    }
  }
  return result;
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

/** Sports WS `wss://sports-api.polymarket.com/ws` 推送的比赛状态消息 */
export interface PolymarketSportResult {
  gameId?: number;
  leagueAbbreviation?: string;
  slug?: string;
  homeTeam?: string;
  awayTeam?: string;
  status?: string;  // "not_started" | "running" | "finished" | "postponed" | "canceled"
  score?: string;   // "000-000|0-0|Bo3"
  period?: string;  // "1/3" | "2/3" | "3/3"
  live?: boolean;
  ended?: boolean;
  finished_timestamp?: string;
}

export interface PolymarketWsPriceChange {
  asset_id?: string;
  price?: string;
  size?: string;
  side?: string;
  best_bid?: string;
  best_ask?: string;
  hash?: string;
}

export interface PolymarketWsMessage {
  event_type?: string;
  asset_id?: string;
  market?: string;
  timestamp?: string | number;
  hash?: string;
  // best_bid_ask event
  best_ask?: string;
  best_bid?: string;
  spread?: string;
  // book event (initial_dump snapshot)
  bids?: Array<{ price?: string | number; size?: string | number }>;
  asks?: Array<{ price?: string | number; size?: string | number }>;
  // price_change event
  price_changes?: PolymarketWsPriceChange[];
}

/**
 * @param initialDump true = 订阅后立即收到 book 快照（连接/重连时用）；
 *                    false = 仅接增量推送（60s 循环重订阅时用，避免快照洪流）。
 */
export function polymarketMarketSubscribeMessage(assetIds: string[], initialDump = true): string {
  return JSON.stringify({
    assets_ids: assetIds,
    type: "market",
    custom_feature_enabled: true,
    initial_dump: initialDump,
  });
}
