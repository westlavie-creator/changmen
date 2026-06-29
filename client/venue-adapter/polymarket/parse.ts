import type { CollectBetDto, CollectMatchDto, CollectTeamDto } from "@/types/collect";
import type { PlatformId } from "@/types/esport";
import { PLATFORMS } from "@/shared/platform";

const PLATFORM: PlatformId = PLATFORMS.Polymarket;
const YES_NO = /^(yes|no|是|否)$/i;
const WINNER_RE = /winner|win|胜者|获胜|moneyline/i;

export interface PolymarketRawMarket {
  id?: string | number;
  condition_id?: string;
  conditionId?: string;
  question?: string;
  title?: string;
  slug?: string;
  active?: boolean;
  closed?: boolean;
  archived?: boolean;
  accepting_orders?: boolean;
  acceptingOrders?: boolean;
  market?: string;
  game_start_time?: string | number;
  gameStartTime?: string | number;
  startDate?: string | number;
  start_date?: string | number;
  clob_token_ids?: unknown;
  clobTokenIds?: unknown;
  outcomes?: unknown;
  outcomePrices?: unknown;
  outcome_prices?: unknown;
  group_item_title?: string;
  groupItemTitle?: string;
  sports_market_type?: string;
  sportsMarketType?: string;
  tags?: unknown;
  events?: unknown;
}

export interface PolymarketRawEvent {
  id?: string | number;
  title?: string;
  slug?: string;
  ticker?: string;
  seriesSlug?: string;
  startTime?: string | number;
  startDate?: string | number;
  tags?: unknown;
  markets?: PolymarketRawMarket[];
  /** Pandascore match ID，与 Sports WS `gameId` 对应 */
  gameId?: string | number;
}

export interface PolymarketBook {
  asset_id?: string;
  bids?: PolymarketPriceLevel[];
  asks?: PolymarketPriceLevel[];
  timestamp?: string | number;
}

export interface PolymarketPriceLevel {
  price?: string | number;
  size?: string | number;
}

export interface PolymarketMappedMarket {
  match: CollectMatchDto;
  bet: CollectBetDto;
  assetIds: [string, string];
  marketId: string;
  /** 对应 Sports WS 的 gameId（pandascore match ID） */
  gameId?: number;
}

export function parseJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value !== "string") return [];
  const trimmed = value.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function tagsText(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value.map((tag) => {
    if (typeof tag === "string") return tag;
    if (tag && typeof tag === "object") {
      const raw = tag as Record<string, unknown>;
      return String(raw.label ?? raw.name ?? raw.slug ?? "");
    }
    return "";
  }).join(" ").toLowerCase();
}

function eventText(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value.map((event) => {
    if (!event || typeof event !== "object") return "";
    const raw = event as Record<string, unknown>;
    const metadata = raw.eventMetadata && typeof raw.eventMetadata === "object"
      ? raw.eventMetadata as Record<string, unknown>
      : {};
    const series = Array.isArray(raw.series) ? raw.series : [];
    const seriesText = series.map((item) => {
      if (!item || typeof item !== "object") return "";
      const row = item as Record<string, unknown>;
      return [row.title, row.slug, row.ticker].filter(Boolean).join(" ");
    }).join(" ");
    return [
      raw.title,
      raw.slug,
      raw.ticker,
      raw.seriesSlug,
      metadata.league,
      metadata.tournament,
      seriesText,
    ].filter(Boolean).join(" ");
  }).join(" ").toLowerCase();
}

export function mapPolymarketGameId(market: PolymarketRawMarket): string | null {
  const text = [
    tagsText(market.tags),
    eventText(market.events),
    market.sports_market_type,
    market.sportsMarketType,
    market.question,
    market.title,
    market.slug,
    market.group_item_title,
    market.groupItemTitle,
  ].filter(Boolean).join(" ").toLowerCase();

  if (/\bleague[-\s]+of[-\s]+legends\b|\blol\b/.test(text)) return "lol";
  if (/\bdota[-\s]*2?\b/.test(text)) return "dota2";
  if (/\bcs2\b|\bcsgo\b|counter[-\s]?strike/.test(text)) return "cs2";
  if (/\bhonor[-\s]+of[-\s]+kings\b|\bking[-\s]+of[-\s]+glory\b|\bkings[-\s]+of[-\s]+glory\b|\bhok\b|\bkog\b|王者荣耀/.test(text)) return "kog";
  if (/\bvalorant\b/.test(text)) return "valorant";
  return null;
}

function marketIdOf(market: PolymarketRawMarket): string {
  return String(market.condition_id ?? market.conditionId ?? market.market ?? market.id ?? "");
}

function eventOf(market: PolymarketRawMarket): PolymarketRawEvent | null {
  const events = Array.isArray(market.events) ? market.events : [];
  const event = events[0];
  return event && typeof event === "object" ? event as PolymarketRawEvent : null;
}

function sourceMatchIdOf(market: PolymarketRawMarket, marketId: string): string {
  const event = eventOf(market);
  return String(event?.id ?? event?.slug ?? marketId);
}

export function normalizePolymarketTeamName(name: string): string {
  const normalized = String(name || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\u4E00-\u9FFF]+/gi, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "unknown";
}

export function sourceTeamId(gameId: string, name: string): string {
  return `${gameId}:${normalizePolymarketTeamName(name)}`;
}

function startTimeOf(market: PolymarketRawMarket): number {
  const raw = market.game_start_time ?? market.gameStartTime ?? market.startDate ?? market.start_date;
  if (raw === undefined || raw === null || raw === "") return Date.now();
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 0) return numeric > 1e12 ? numeric : numeric * 1000;
  const parsed = Date.parse(String(raw));
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function isOpenMarket(market: PolymarketRawMarket): boolean {
  if (market.active === false) return false;
  if (market.closed || market.archived) return false;
  if (market.accepting_orders === false || market.acceptingOrders === false) return false;
  return true;
}

function mapNumberOf(market: PolymarketRawMarket): number | null {
  const type = String(market.sports_market_type ?? market.sportsMarketType ?? "").toLowerCase();
  const groupTitle = String(market.group_item_title ?? market.groupItemTitle ?? "").trim().toLowerCase();
  if (groupTitle === "match winner")
    return 0;
  const groupMap = /^(?:map|game)\s*(\d+)\s+winner$/.exec(groupTitle);
  if (groupMap)
    return Number(groupMap[1]);

  const text = [
    type,
    market.question,
    market.title,
  ].filter(Boolean).join(" ");
  if (type === "moneyline" && WINNER_RE.test(text))
    return 0;
  if (type === "child_moneyline") {
    const questionMap = /\b(?:map|game)\s*(\d+)\s+winner\b/i.exec(text);
    if (questionMap)
      return Number(questionMap[1]);
  }
  return null;
}

function betNameOf(map: number): string {
  return map > 0 ? `[地图${map}] 获胜者` : "[全场] 获胜者";
}

/** 订单展示用文案（含已关闭 market，不做 open 过滤） */
export function polymarketOrderContextFromMarket(market: PolymarketRawMarket): {
  game: string;
  match: string;
  bet: string;
} {
  const map = mapNumberOf(market);
  const game = mapPolymarketGameId(market) ?? "";
  const match = String(market.question ?? market.title ?? market.slug ?? "").trim();
  let bet = "";
  if (map === 0)
    bet = "全场";
  else if (map !== null && map > 0)
    bet = `地图${map}`;
  return { game, match, bet };
}

/** Sports WS period "1/3" → 1；无效格式返回 null */
export function parsePeriodToRound(period: string | undefined): number | null {
  if (!period)
    return null;
  const n = Number.parseInt(period, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function decimalOddsFromProbability(price: string | number | undefined): number {
  const value = Number(price);
  if (!Number.isFinite(value) || value <= 0 || value >= 1) return 0;
  return Number((1 / value).toFixed(4));
}

export function bestAskFromBook(book: PolymarketBook | undefined): number {
  const asks = book?.asks ?? [];
  let best = Number.POSITIVE_INFINITY;
  for (const level of asks) {
    const price = Number(level.price);
    const size = Number(level.size);
    if (Number.isFinite(price) && price > 0 && price < best && (!Number.isFinite(size) || size > 0)) {
      best = price;
    }
  }
  return Number.isFinite(best) ? best : 0;
}

/**
 * 将 Polymarket market 原始数据解析为内部结构。
 * `buyPrices`：从 CLOB /prices?sides=BUY 批量获取的概率价格 Record<assetId, probability>。
 * 缺失 assetId 时 odds=0，Status="Locked"（等 WS 推送更新）。
 */
export function buildPolymarketMappedMarket(
  market: PolymarketRawMarket,
  buyPrices: Record<string, number | string> = {},
): PolymarketMappedMarket | null {
  if (!isOpenMarket(market)) return null;
  const map = mapNumberOf(market);
  if (map === null) return null;

  const assetIds = parseJsonArray(market.clob_token_ids ?? market.clobTokenIds);
  const outcomes = parseJsonArray(market.outcomes);
  if (assetIds.length !== 2 || outcomes.length !== 2) return null;
  if (outcomes.some(name => YES_NO.test(name.trim()))) return null;

  const marketId = marketIdOf(market);
  const gameId = mapPolymarketGameId(market);
  if (!marketId || !gameId) return null;

  const [homeId, awayId] = assetIds as [string, string];
  const [homeName, awayName] = outcomes as [string, string];
  const sourceMatchId = sourceMatchIdOf(market, marketId);
  const startTime = startTimeOf(market);
  const matchHomeId = sourceTeamId(gameId, homeName);
  const matchAwayId = sourceTeamId(gameId, awayName);

  const homeTeam: CollectTeamDto = {
    Type: PLATFORM,
    TeamID: matchHomeId,
    Name: homeName,
    GameID: gameId,
    Logo: "",
  };
  const awayTeam: CollectTeamDto = {
    Type: PLATFORM,
    TeamID: matchAwayId,
    Name: awayName,
    GameID: gameId,
    Logo: "",
  };

  const homeOdds = decimalOddsFromProbability(buyPrices[homeId]);
  const awayOdds = decimalOddsFromProbability(buyPrices[awayId]);
  const locked = !homeOdds || !awayOdds;

  const event = eventOf(market);
  const pandascoreId = event?.gameId ? Number(event.gameId) : undefined;

  return {
    marketId,
    assetIds: [homeId, awayId],
    gameId: pandascoreId,
    match: {
      Type: PLATFORM,
      SourceMatchID: sourceMatchId,
      SourceGameID: gameId,
      StartTime: startTime,
      HomeID: matchHomeId,
      Home: homeName,
      AwayID: matchAwayId,
      Away: awayName,
      Teams: [homeTeam, awayTeam],
    },
    bet: {
      Type: PLATFORM,
      SourceMatchID: sourceMatchId,
      SourceBetID: marketId,
      Map: map,
      BetName: betNameOf(map),
      SourceHomeID: homeId,
      HomeName: homeName,
      HomeOdds: homeOdds,
      SourceAwayID: awayId,
      AwayName: awayName,
      AwayOdds: awayOdds,
      Status: locked ? "Locked" : "Normal",
    },
  };
}
