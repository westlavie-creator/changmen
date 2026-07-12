const GAMMA_BASE = import.meta.env.DEV ? "/gamma" : "https://gamma-api.polymarket.com";
const CLOB_BASE = import.meta.env.DEV ? "/clob" : "https://clob.polymarket.com";

const MLB_SPORT_KEY = "mlb";
const DEFAULT_MLB_SERIES_ID = "3";
const KEYSET_PAGE_LIMIT = 200;
const MAX_KEYSET_PAGES = 5;
const PAST_MS = 24 * 3600 * 1000;
const FUTURE_MS = 7 * 24 * 3600 * 1000;

export interface MlbOutcomeQuote {
  name: string;
  probability: number;
  decimalOdds: number;
  tokenId: string;
}

export interface MlbMarketQuote {
  type: string;
  label: string;
  outcomes: MlbOutcomeQuote[];
}

export interface MlbEventQuote {
  id: string;
  title: string;
  slug: string;
  gameId?: number;
  startTimeMs: number;
  moneyline: MlbMarketQuote | null;
  markets: MlbMarketQuote[];
}

interface GammaSportsRow {
  sport?: string;
  series?: string | number;
}

interface GammaMarket {
  id?: string | number;
  question?: string;
  sportsMarketType?: string;
  sports_market_type?: string;
  groupItemTitle?: string;
  group_item_title?: string;
  outcomes?: unknown;
  outcomePrices?: unknown;
  outcome_prices?: unknown;
  clobTokenIds?: unknown;
  clob_token_ids?: unknown;
  active?: boolean;
  closed?: boolean;
  acceptingOrders?: boolean;
  accepting_orders?: boolean;
}

interface GammaEvent {
  id?: string | number;
  title?: string;
  slug?: string;
  gameId?: string | number;
  startTime?: string | number;
  startDate?: string | number;
  markets?: GammaMarket[];
}

interface KeysetResponse {
  data?: GammaEvent[];
  events?: GammaEvent[];
  next_cursor?: string | null;
  nextCursor?: string | null;
}

function parseJsonArray(value: unknown): string[] {
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

function decimalOddsFromProbability(price: string | number | undefined): number {
  const value = Number(price);
  if (!Number.isFinite(value) || value <= 0 || value >= 1)
    return 0;
  return Math.round((1 / value) * 1000) / 1000;
}

function startTimeMsOf(event: GammaEvent): number {
  const raw = event.startTime ?? event.startDate;
  if (raw === undefined || raw === null || raw === "")
    return Date.now();
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 0)
    return numeric > 1e12 ? numeric : numeric * 1000;
  const parsed = Date.parse(String(raw));
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function marketTypeOf(market: GammaMarket): string {
  return String(market.sportsMarketType ?? market.sports_market_type ?? "").toLowerCase();
}

function marketLabelOf(market: GammaMarket): string {
  const group = String(market.groupItemTitle ?? market.group_item_title ?? "").trim();
  if (group)
    return group;
  const type = marketTypeOf(market);
  if (type)
    return type;
  return String(market.question ?? "").trim();
}

function isOpenMarket(market: GammaMarket): boolean {
  if (market.active === false)
    return false;
  if (market.closed)
    return false;
  if (market.accepting_orders === false || market.acceptingOrders === false)
    return false;
  return true;
}

function mapMarketQuote(market: GammaMarket): MlbMarketQuote | null {
  const outcomes = parseJsonArray(market.outcomes);
  const prices = parseJsonArray(market.outcomePrices ?? market.outcome_prices);
  const tokenIds = parseJsonArray(market.clobTokenIds ?? market.clob_token_ids);
  if (!outcomes.length)
    return null;

  const quotes: MlbOutcomeQuote[] = outcomes.map((name, index) => {
    const probability = Number(prices[index] ?? 0);
    return {
      name,
      probability: Number.isFinite(probability) ? probability : 0,
      decimalOdds: decimalOddsFromProbability(prices[index]),
      tokenId: tokenIds[index] ?? "",
    };
  });

  return {
    type: marketTypeOf(market) || "other",
    label: marketLabelOf(market),
    outcomes: quotes,
  };
}

function unwrapEvents(data: unknown): GammaEvent[] {
  if (Array.isArray(data))
    return data as GammaEvent[];
  const wrapped = data as KeysetResponse;
  if (Array.isArray(wrapped.data))
    return wrapped.data;
  if (Array.isArray(wrapped.events))
    return wrapped.events;
  return [];
}

function nextCursor(data: unknown): string {
  if (!data || typeof data !== "object")
    return "";
  const wrapped = data as KeysetResponse;
  return String(wrapped.next_cursor ?? wrapped.nextCursor ?? "");
}

async function gammaGet<T>(path: string): Promise<T> {
  const response = await fetch(`${GAMMA_BASE}${path}`);
  if (!response.ok)
    throw new Error(`Gamma ${response.status}: ${path}`);
  return response.json() as Promise<T>;
}

async function fetchMlbSeriesIds(): Promise<string[]> {
  try {
    const sports = await gammaGet<GammaSportsRow[]>("/sports");
    const ids = (Array.isArray(sports) ? sports : [])
      .filter(row => String(row.sport ?? "").toLowerCase() === MLB_SPORT_KEY)
      .map(row => String(row.series ?? "").trim())
      .filter(Boolean);
    if (ids.length)
      return [...new Set(ids)];
  }
  catch (err) {
    console.warn("[mlbGamma] /sports fallback", err);
  }
  return [DEFAULT_MLB_SERIES_ID];
}

async function fetchBatchBuyPrices(assetIds: string[]): Promise<Record<string, number>> {
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
  const data = await response.json() as Record<string, Record<string, unknown>>;
  const result: Record<string, number> = {};
  for (const [tokenId, sides] of Object.entries(data ?? {})) {
    const price = Number(sides?.SELL ?? 0);
    if (price > 0 && price < 1)
      result[tokenId] = price;
  }
  return result;
}

function applyLivePrices(markets: MlbMarketQuote[], livePrices: Record<string, number>): void {
  for (const market of markets) {
    for (const outcome of market.outcomes) {
      const live = outcome.tokenId ? livePrices[outcome.tokenId] : undefined;
      if (live === undefined)
        continue;
      outcome.probability = live;
      outcome.decimalOdds = decimalOddsFromProbability(live);
    }
  }
}

function mapEventQuote(event: GammaEvent): MlbEventQuote | null {
  const title = String(event.title ?? "").trim();
  if (!title)
    return null;

  const openMarkets = (event.markets ?? []).filter(isOpenMarket);
  const markets = openMarkets
    .map(mapMarketQuote)
    .filter((row): row is MlbMarketQuote => row !== null);

  const moneyline = markets.find(market => market.type === "moneyline") ?? null;
  const gameIdRaw = (event as GammaEvent).gameId;
  const gameId = gameIdRaw != null ? Number(gameIdRaw) : undefined;

  return {
    id: String(event.id ?? event.slug ?? title),
    title,
    slug: String(event.slug ?? ""),
    gameId: Number.isFinite(gameId) ? gameId : undefined,
    startTimeMs: startTimeMsOf(event),
    moneyline,
    markets,
  };
}

export async function fetchMlbEvents(): Promise<MlbEventQuote[]> {
  const seriesIds = await fetchMlbSeriesIds();
  const now = Date.now();
  const events: MlbEventQuote[] = [];
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

    const data = await gammaGet<unknown>(`/events/keyset?${params.toString()}`);
    for (const raw of unwrapEvents(data)) {
      const mapped = mapEventQuote(raw);
      if (mapped)
        events.push(mapped);
    }
    cursor = nextCursor(data);
    if (!cursor)
      break;
  }

  events.sort((a, b) => a.startTimeMs - b.startTimeMs);

  const tokenIds = [...new Set(
    events.flatMap(event => event.markets.flatMap(market => market.outcomes.map(outcome => outcome.tokenId))).filter(Boolean),
  )];
  if (tokenIds.length) {
    const livePrices = await fetchBatchBuyPrices(tokenIds.slice(0, 200));
    for (const event of events)
      applyLivePrices(event.markets, livePrices);
  }

  return events;
}
