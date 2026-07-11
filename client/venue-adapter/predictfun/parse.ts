import type { CollectBetDto, CollectMatchDto, CollectTeamDto } from "@changmen/client-core/types/collect";
import type { PlatformId } from "@changmen/api-contract";
import { truncateOddsTo3 } from "@changmen/shared/odds_format";
import { PLATFORMS } from "@venue/shared/platforms";

const PLATFORM: PlatformId = PLATFORMS.PredictFun;

export interface PredictTag {
  id?: string;
  name?: string;
}

export interface PredictTeam {
  id?: number;
  name?: string;
  abbreviation?: string;
  alias?: string;
  league?: string;
}

export interface PredictOutcome {
  name?: string;
  indexSet?: number;
  onChainId?: string;
  status?: string;
  bestBid?: { price?: string | number };
  bestAsk?: { price?: string | number };
}

export interface PredictMarket {
  id?: number;
  title?: string;
  question?: string;
  status?: string;
  tradingStatus?: string;
  marketType?: string;
  marketVariant?: string;
  categorySlug?: string;
  decimalPrecision?: number;
  team?: PredictTeam;
  outcomes?: PredictOutcome[];
}

export interface PredictCategory {
  id?: number;
  slug?: string;
  title?: string;
  status?: string;
  marketVariant?: string;
  startsAt?: string;
  endsAt?: string;
  tags?: PredictTag[];
  teams?: PredictTeam[];
  markets?: PredictMarket[];
}

export type PredictOrderbookLevel = [number, number];

export interface PredictOrderbookData {
  marketId?: number;
  updateTimestampMs?: number;
  asks?: PredictOrderbookLevel[];
  bids?: PredictOrderbookLevel[];
}

export interface PredictMappedMarket {
  match: CollectMatchDto;
  bet: CollectBetDto;
  homeMarketId: string;
  awayMarketId: string;
  homeTokenId: string;
  awayTokenId: string;
  categoryId: string;
}

const ESPORT_TAG_RE = /\b(cs2|counter[- ]?strike|lol|league[- ]?of[- ]?legends|dota-?2|valorant|esport|esports)\b/i;
const ESPORT_LEAGUE_RE = /\b(cs2|counter[- ]?strike|lol|league[- ]?of[- ]?legends|dota-?2|valorant|lck|lpl|lec|lcs|vct|blast|iem|esl)\b/i;

export function mapPredictEsportTag(name: string | undefined): string | null {
  const raw = String(name ?? "").trim().toLowerCase();
  if (!raw)
    return null;
  if (raw.includes("cs2") || raw.includes("counter-strike") || raw.includes("counter strike"))
    return "cs2";
  if (raw.includes("lol") || raw.includes("league-of-legends") || raw.includes("league of legends"))
    return "lol";
  if (raw.includes("dota-2") || raw.includes("dota2") || raw.includes("dota 2"))
    return "dota2";
  if (raw.includes("valorant"))
    return "valorant";
  return null;
}

export function resolvePredictGameCode(category: PredictCategory): string | null {
  for (const tag of category.tags ?? []) {
    const code = mapPredictEsportTag(tag.name);
    if (code)
      return code;
    if (ESPORT_TAG_RE.test(String(tag.name ?? ""))) {
      const fromTag = mapPredictEsportTag(tag.name);
      if (fromTag)
        return fromTag;
    }
  }
  for (const team of category.teams ?? []) {
    const code = mapPredictEsportTag(team.league);
    if (code)
      return code;
    if (ESPORT_LEAGUE_RE.test(String(team.league ?? ""))) {
      const fromLeague = mapPredictEsportTag(team.league);
      if (fromLeague)
        return fromLeague;
    }
  }
  for (const market of category.markets ?? []) {
    const code = mapPredictEsportTag(market.team?.league);
    if (code)
      return code;
  }
  return null;
}

function isOpenTradingMarket(market: PredictMarket): boolean {
  if (String(market.status ?? "").toUpperCase() !== "OPEN")
    return false;
  const trading = String(market.tradingStatus ?? "OPEN").toUpperCase();
  if (trading && !["OPEN", "MATCHING_NOT_PAUSED"].includes(trading))
    return false;
  if (market.marketType && market.marketType !== "SPORTS_MONEYLINE")
    return false;
  const title = String(market.title ?? market.team?.name ?? "").trim().toLowerCase();
  if (!title || title === "draw" || title === "tie")
    return false;
  return Boolean(market.team?.name || market.title);
}

export function isPredictEsportsMoneylineCategory(category: PredictCategory): boolean {
  if (category.marketVariant !== "SPORTS_TEAM_MATCH")
    return false;
  if (String(category.status ?? "").toUpperCase() !== "OPEN")
    return false;
  if (!resolvePredictGameCode(category))
    return false;
  const teamMarkets = (category.markets ?? []).filter(isOpenTradingMarket);
  return teamMarkets.length >= 2;
}

export function normalizePredictTeamName(name: string): string {
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
  return `${gameId}:${normalizePredictTeamName(name)}`;
}

export function decimalOddsFromProbability(price: string | number | undefined): number {
  const value = Number(price);
  if (!Number.isFinite(value) || value <= 0 || value >= 1)
    return 0;
  return truncateOddsTo3(1 / value);
}

/** [Predict 官方] orderbook asks/bids 为 [price, size] 元组，Yes 侧 best ask 在 asks[0] */
export function bestAskFromPredictBook(book: PredictOrderbookData | undefined): number {
  const asks = book?.asks ?? [];
  const first = asks[0];
  if (Array.isArray(first)) {
    const price = Number(first[0]);
    const size = Number(first[1]);
    if (Number.isFinite(price) && price > 0 && price < 1 && (!Number.isFinite(size) || size > 0))
      return price;
  }
  let best = Number.POSITIVE_INFINITY;
  for (const level of asks) {
    if (!Array.isArray(level))
      continue;
    const price = Number(level[0]);
    const size = Number(level[1]);
    if (Number.isFinite(price) && price > 0 && price < best && (!Number.isFinite(size) || size > 0))
      best = price;
  }
  return Number.isFinite(best) && best < 1 ? best : 0;
}

function yesOutcomeTokenId(market: PredictMarket): string {
  const outcomes = market.outcomes ?? [];
  const yes = outcomes.find(o => String(o.name ?? "").toLowerCase() === "yes") ?? outcomes[0];
  return String(yes?.onChainId ?? "");
}

function teamNameOf(market: PredictMarket): string {
  return String(market.team?.name ?? market.title ?? "").trim();
}

function startTimeOf(category: PredictCategory): number {
  const raw = category.startsAt;
  if (raw) {
    const ms = Date.parse(raw);
    if (Number.isFinite(ms))
      return ms;
  }
  return Date.now();
}

function pickHomeAwayMarkets(markets: PredictMarket[]): { home: PredictMarket; away: PredictMarket } | null {
  const teamMarkets = markets.filter(isOpenTradingMarket);
  if (teamMarkets.length < 2)
    return null;
  const [home, away] = teamMarkets.slice(0, 2);
  if (!teamNameOf(home) || !teamNameOf(away))
    return null;
  return { home, away };
}

/**
 * SPORTS_TEAM_MATCH：每队一个 market，买入 Yes = 该队获胜。
 * `buyPrices` 可选 marketId → 买入 Yes 的概率价（orderbook best ask）。
 */
export function buildPredictMappedMarket(
  category: PredictCategory,
  buyPrices: Record<string, number> = {},
): PredictMappedMarket | null {
  if (!isPredictEsportsMoneylineCategory(category))
    return null;

  const picked = pickHomeAwayMarkets(category.markets ?? []);
  if (!picked)
    return null;

  const gameId = resolvePredictGameCode(category);
  if (!gameId)
    return null;

  const homeMarketId = String(picked.home.id ?? "");
  const awayMarketId = String(picked.away.id ?? "");
  const homeTokenId = yesOutcomeTokenId(picked.home);
  const awayTokenId = yesOutcomeTokenId(picked.away);
  if (!homeMarketId || !awayMarketId || !homeTokenId || !awayTokenId)
    return null;

  const categoryId = String(category.slug ?? category.id ?? "");
  const sourceMatchId = String(category.id ?? category.slug ?? categoryId);
  if (!categoryId)
    return null;

  const homeName = teamNameOf(picked.home);
  const awayName = teamNameOf(picked.away);
  const matchHomeId = sourceTeamId(gameId, homeName);
  const matchAwayId = sourceTeamId(gameId, awayName);
  const startTime = startTimeOf(category);

  const homeProb = buyPrices[homeMarketId] ?? 0;
  const awayProb = buyPrices[awayMarketId] ?? 0;
  const homeOdds = decimalOddsFromProbability(homeProb);
  const awayOdds = decimalOddsFromProbability(awayProb);
  const locked = !homeOdds || !awayOdds;

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

  return {
    categoryId,
    homeMarketId,
    awayMarketId,
    homeTokenId,
    awayTokenId,
    match: {
      Type: PLATFORM,
      SourceMatchID: sourceMatchId,
      SourceGameID: gameId,
      StartTime: startTime,
      HomeTeam: homeTeam,
      AwayTeam: awayTeam,
      Title: String(category.title ?? `${homeName} vs ${awayName}`),
      League: String(category.tags?.[0]?.name ?? picked.home.team?.league ?? ""),
    },
    bet: {
      Type: PLATFORM,
      SourceBetID: categoryId,
      SourceMatchID: sourceMatchId,
      SourceHomeID: homeTokenId,
      SourceAwayID: awayTokenId,
      BetName: "Match Winner",
      HomeOdds: homeOdds,
      AwayOdds: awayOdds,
      Status: locked ? "Locked" : "Normal",
    },
  };
}
