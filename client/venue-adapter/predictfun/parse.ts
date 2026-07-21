import type { CollectBetDto, CollectMatchDto } from "@changmen/client-core/types/collect";
import type { PlatformId } from "@changmen/api-contract";
import { truncateOddsTo3 } from "@changmen/shared/odds_format";
import { PLATFORMS } from "../shared/platforms";

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
  bestBid?: { price?: string | number } | number | string | null;
  bestAsk?: { price?: string | number } | number | string | null;
  team?: PredictTeam;
  variantData?: {
    type?: string;
    team?: PredictTeam;
  };
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

/** 单 market 的 Yes book → token 买价映射（对齐官方 orderbook + getComplement） */
export interface PredictFunBookMeta {
  decimalPrecision: number;
  tokens: Array<{ tokenId: string; isYes: boolean }>;
}

export interface PredictMappedMarket {
  match: CollectMatchDto;
  /** 全场或首条，兼容旧调用方 */
  bet: CollectBetDto;
  /** 全场 + Game N 局盘 */
  bets: CollectBetDto[];
  homeMarketId: string;
  awayMarketId: string;
  homeTokenId: string;
  awayTokenId: string;
  categoryId: string;
  marketIds?: string[];
  /** marketId → Yes token / precision；供 Index 与 hub 拆两侧买价 */
  bookMetaByMarketId?: Record<string, { yesTokenId: string; decimalPrecision: number }>;
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

export function resolvePredictGameCodeFromVariant(variant: string | undefined): string | null {
  const v = String(variant ?? "").toUpperCase();
  if (!v.startsWith("ESPORTS_"))
    return null;
  if (v.includes("CS2") || v.includes("COUNTER"))
    return "cs2";
  if (v.includes("LOL") || v.includes("LEAGUE"))
    return "lol";
  if (v.includes("DOTA"))
    return "dota2";
  if (v.includes("VALORANT"))
    return "valorant";
  return null;
}

function resolvePredictGameCodeFromCategoryMeta(category: PredictCategory): string | null {
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
  return resolvePredictGameCodeFromVariant(category.marketVariant);
}

export function resolvePredictGameCode(category: PredictCategory): string | null {
  const fromMeta = resolvePredictGameCodeFromCategoryMeta(category);
  if (fromMeta)
    return fromMeta;
  for (const market of category.markets ?? []) {
    const code = mapPredictEsportTag(market.team?.league);
    if (code)
      return code;
    for (const outcome of market.outcomes ?? []) {
      const league = outcome.team?.league ?? outcome.variantData?.team?.league;
      const fromOutcome = mapPredictEsportTag(league);
      if (fromOutcome)
        return fromOutcome;
    }
  }
  return resolvePredictGameCodeFromVariant(category.marketVariant);
}

export function isTradablePredictMarket(market: PredictMarket): boolean {
  const trading = String(market.tradingStatus ?? "OPEN").toUpperCase();
  if (trading && !["OPEN", "MATCHING_NOT_PAUSED"].includes(trading))
    return false;
  const status = String(market.status ?? "").toUpperCase();
  if (status && !["OPEN", "REGISTERED", "PRICE_PROPOSED"].includes(status))
    return false;
  return true;
}

/** "Game 3 Winner" → 3 */
export function parsePredictGameMapNumber(title: string | undefined): number {
  const m = String(title ?? "").trim().match(/^Game\s+(\d+)\s+Winner$/i);
  if (!m)
    return 0;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function isCollectableChildMoneyline(market: PredictMarket): boolean {
  if (String(market?.marketType ?? "") !== "SPORTS_CHILD_MONEYLINE")
    return false;
  if (parsePredictGameMapNumber(market.title) <= 0)
    return false;
  const status = String(market.status ?? "").toUpperCase();
  const trading = String(market.tradingStatus ?? "").toUpperCase();
  if (["RESOLVED", "SETTLED"].includes(status) || trading === "CLOSED")
    return true;
  return isTradablePredictMarket(market);
}

function isDualTeamMoneylineMarket(market: PredictMarket): boolean {
  if (!isTradablePredictMarket(market))
    return false;
  if (market.marketType && market.marketType !== "SPORTS_MONEYLINE")
    return false;
  const title = String(market.title ?? market.team?.name ?? "").trim().toLowerCase();
  if (!title || title === "draw" || title === "tie" || title === "match winner")
    return false;
  return Boolean(market.team?.name || (title && title !== "match winner"));
}

export function readPredictTopPrice(level: unknown): number {
  if (level == null)
    return 0;
  if (typeof level === "number")
    return Number.isFinite(level) && level > 0 && level < 1 ? level : 0;
  if (typeof level === "string") {
    const n = Number(level);
    return Number.isFinite(n) && n > 0 && n < 1 ? n : 0;
  }
  if (typeof level === "object") {
    const n = Number((level as { price?: unknown }).price);
    return Number.isFinite(n) && n > 0 && n < 1 ? n : 0;
  }
  return 0;
}

export function outcomeProb(outcome: PredictOutcome | undefined, bookProb = 0): number {
  const ask = readPredictTopPrice(outcome?.bestAsk);
  const bid = readPredictTopPrice(outcome?.bestBid);
  if (ask > 0 && bid > 0 && (ask - bid) >= 0.5)
    return (ask + bid) / 2;
  if (ask > 0)
    return ask;
  if (Number.isFinite(bookProb) && bookProb > 0 && bookProb < 1)
    return bookProb;
  if (bid > 0)
    return bid;
  return 0;
}

export function outcomeTeamName(outcome: PredictOutcome | undefined): string {
  return String(
    outcome?.team?.name
    ?? outcome?.variantData?.team?.name
    ?? "",
  ).trim();
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

/**
 * [Predict 官方] Yes + No = 1（按 market.decimalPrecision 取整）；禁止裸 `1 - price`。
 * @see https://dev.predict.fun/understanding-the-orderbook-685654m0
 */
export function getPredictComplement(price: number, decimalPrecision = 2): number {
  const precision = Number.isFinite(decimalPrecision) && decimalPrecision >= 0
    ? Math.floor(Number(decimalPrecision))
    : 2;
  const factor = 10 ** precision;
  const raw = Number(price);
  if (!Number.isFinite(raw))
    return NaN;
  return (factor - Math.round(raw * factor)) / factor;
}

function normalizeBookLevels(levels: PredictOrderbookLevel[] | undefined): PredictOrderbookLevel[] {
  const out: PredictOrderbookLevel[] = [];
  for (const level of levels ?? []) {
    if (!Array.isArray(level))
      continue;
    const price = Number(level[0]);
    const size = Number(level[1]);
    if (!Number.isFinite(price) || price <= 0 || price >= 1)
      continue;
    if (!Number.isFinite(size) || size <= 0)
      continue;
    out.push([price, size]);
  }
  return out;
}

function sortAsksAsc(levels: PredictOrderbookLevel[]): PredictOrderbookLevel[] {
  return [...levels].sort((a, b) => a[0] - b[0]);
}

function sortBidsDesc(levels: PredictOrderbookLevel[]): PredictOrderbookLevel[] {
  return [...levels].sort((a, b) => b[0] - a[0]);
}

export type PredictOutcomeRef = Pick<PredictOutcome, "name" | "indexSet" | "onChainId">;

/** token 是否对应官方 orderbook 的 Yes 侧（indexSet=1 / name=Yes / outcomes[0]） */
export function isPredictYesOutcomeToken(
  tokenId: string,
  outcomes: PredictOutcomeRef[] | undefined,
): boolean {
  const tid = String(tokenId ?? "").trim();
  const list = outcomes ?? [];
  if (!tid || !list.length)
    return true;
  const match = list.find(o => String(o?.onChainId ?? "").trim() === tid);
  if (!match)
    return String(list[0]?.onChainId ?? "").trim() === tid;
  const name = String(match.name ?? "").trim().toLowerCase();
  if (name === "yes")
    return true;
  if (name === "no")
    return false;
  const indexSet = Number(match.indexSet);
  if (indexSet === 1)
    return true;
  if (indexSet === 2)
    return false;
  return String(list[0]?.onChainId ?? "").trim() === tid;
}

/**
 * [Predict 官方] GET orderbook 只含 Yes；买 No 须交换并 getComplement 各档。
 * SDK getMarketOrderAmounts(BUY) 直接吃传入的 asks，不会自动补全。
 */
export function orderbookForOutcomeBuy(
  yesBook: PredictOrderbookData | null | undefined,
  opts: {
    isYesOutcome: boolean;
    decimalPrecision?: number;
  },
): PredictOrderbookData {
  const yesAsks = normalizeBookLevels(yesBook?.asks);
  const yesBids = normalizeBookLevels(yesBook?.bids);
  if (opts.isYesOutcome) {
    return {
      marketId: yesBook?.marketId,
      updateTimestampMs: yesBook?.updateTimestampMs,
      asks: sortAsksAsc(yesAsks),
      bids: sortBidsDesc(yesBids),
    };
  }
  const precision = Number.isFinite(opts.decimalPrecision)
    ? Number(opts.decimalPrecision)
    : 2;
  const noAsks = yesBids.map(([p, q]) => [getPredictComplement(p, precision), q] as PredictOrderbookLevel);
  const noBids = yesAsks.map(([p, q]) => [getPredictComplement(p, precision), q] as PredictOrderbookLevel);
  return {
    marketId: yesBook?.marketId,
    updateTimestampMs: yesBook?.updateTimestampMs,
    asks: sortAsksAsc(normalizeBookLevels(noAsks)),
    bids: sortBidsDesc(normalizeBookLevels(noBids)),
  };
}

/** 买该 outcome 的 best ask（Yes=asks[0]；No=complement(bids) 后 asks[0]） */
export function predictBuyAskFromYesBook(
  yesBook: PredictOrderbookData | null | undefined,
  isYesOutcome: boolean,
  decimalPrecision = 2,
): number {
  return bestAskFromPredictBook(orderbookForOutcomeBuy(yesBook, {
    isYesOutcome,
    decimalPrecision,
  }));
}

/** 官方 orderbook Yes 侧 token（indexSet=1 / name=Yes / outcomes[0]） */
export function yesOutcomeOnChainId(
  market: { outcomes?: PredictOutcomeRef[] } | null | undefined,
): string {
  const outcomes = market?.outcomes ?? [];
  const yes = outcomes.find((o) => {
    const name = String(o?.name ?? "").trim().toLowerCase();
    if (name === "yes")
      return true;
    return Number(o?.indexSet) === 1;
  }) ?? outcomes[0];
  return String(yes?.onChainId ?? "").trim();
}

/** 从 Index/映射登记 hub 用的 book→token 元数据 */
export function buildPredictFunBookMeta(opts: {
  homeTokenId: string;
  awayTokenId: string;
  yesTokenId?: string;
  decimalPrecision?: number;
  /** 同 market 双 outcome；false=每队一盘，只写该盘 Yes token */
  dualOutcomeSameMarket: boolean;
  /** 双盘时本 meta 只绑定的一侧 token */
  sideTokenId?: string;
}): PredictFunBookMeta {
  const precision = Number.isFinite(opts.decimalPrecision)
    ? Math.floor(Number(opts.decimalPrecision))
    : 2;
  const home = String(opts.homeTokenId || "").trim();
  const away = String(opts.awayTokenId || "").trim();
  if (!opts.dualOutcomeSameMarket) {
    const tok = String(opts.sideTokenId || home || away).trim();
    return {
      decimalPrecision: precision >= 0 ? precision : 2,
      tokens: tok ? [{ tokenId: tok, isYes: true }] : [],
    };
  }
  const yesTok = String(opts.yesTokenId || "").trim();
  // 单盘双 outcome 必须有 yesTokenId，否则无法判断谁吃 Yes book；宁可不展开
  if (!yesTok) {
    return {
      decimalPrecision: precision >= 0 ? precision : 2,
      tokens: [],
    };
  }
  const tokens: PredictFunBookMeta["tokens"] = [];
  if (home)
    tokens.push({ tokenId: home, isYes: home === yesTok });
  if (away && away !== home)
    tokens.push({ tokenId: away, isYes: away === yesTok });
  return {
    decimalPrecision: precision >= 0 ? precision : 2,
    tokens,
  };
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

function pickDualTeamMarkets(markets: PredictMarket[]): { mode: "dual"; home: PredictMarket; away: PredictMarket } | null {
  const teamMarkets = markets.filter(isDualTeamMoneylineMarket);
  if (teamMarkets.length < 2)
    return null;
  const [home, away] = teamMarkets.slice(0, 2);
  if (!teamNameOf(home) || !teamNameOf(away))
    return null;
  return { mode: "dual", home, away };
}

function pickSingleMoneylineMarket(markets: PredictMarket[]): {
  mode: "single";
  market: PredictMarket;
  homeOutcome: PredictOutcome;
  awayOutcome: PredictOutcome;
} | null {
  const tradable = markets.filter(isTradablePredictMarket);
  const ml = tradable.find(m => String(m.marketType ?? "") === "SPORTS_MONEYLINE")
    || tradable.find(m => (m.outcomes ?? []).length >= 2 && parsePredictGameMapNumber(m.title) === 0);
  if (!ml)
    return null;
  const outcomes = ml.outcomes ?? [];
  if (outcomes.length < 2)
    return null;
  const withTeam = outcomes.filter(o => outcomeTeamName(o));
  const homeOutcome = withTeam[0];
  const awayOutcome = withTeam[1];
  if (!homeOutcome || !awayOutcome)
    return null;
  return { mode: "single", market: ml, homeOutcome, awayOutcome };
}

function pickChildGameMarkets(markets: PredictMarket[]): Array<{
  mapNum: number;
  market: PredictMarket;
  homeOutcome: PredictOutcome;
  awayOutcome: PredictOutcome;
}> {
  const out: Array<{
    mapNum: number;
    market: PredictMarket;
    homeOutcome: PredictOutcome;
    awayOutcome: PredictOutcome;
  }> = [];
  for (const market of markets || []) {
    if (!isCollectableChildMoneyline(market))
      continue;
    const mapNum = parsePredictGameMapNumber(market.title);
    if (mapNum <= 0)
      continue;
    const outcomes = market.outcomes ?? [];
    const withTeam = outcomes.filter(o => outcomeTeamName(o));
    const homeOutcome = withTeam[0];
    const awayOutcome = withTeam[1];
    if (!homeOutcome || !awayOutcome)
      continue;
    out.push({ mapNum, market, homeOutcome, awayOutcome });
  }
  return out.sort((a, b) => a.mapNum - b.mapNum);
}

function buildBetFromDualOutcomes(opts: {
  sourceMatchId: string;
  sourceBetId: string;
  mapNum: number;
  betName: string;
  homeName: string;
  awayName: string;
  homeTokenId: string;
  awayTokenId: string;
  homeOdds: number;
  awayOdds: number;
  forceLocked?: boolean;
}): CollectBetDto {
  const locked = Boolean(opts.forceLocked) || !opts.homeOdds || !opts.awayOdds;
  return {
    Type: PLATFORM,
    SourceMatchID: opts.sourceMatchId,
    SourceBetID: opts.sourceBetId,
    Map: opts.mapNum,
    BetName: opts.betName,
    SourceHomeID: opts.homeTokenId,
    HomeName: opts.homeName,
    HomeOdds: opts.homeOdds,
    SourceAwayID: opts.awayTokenId,
    AwayName: opts.awayName,
    AwayOdds: opts.awayOdds,
    Status: locked ? "Locked" : "Normal",
  };
}

export function isPredictEsportsMoneylineCategory(category: PredictCategory): boolean {
  if (String(category.status ?? "").toUpperCase() !== "OPEN")
    return false;
  const variant = String(category.marketVariant ?? "");
  const esportsVariant = variant.startsWith("ESPORTS_");
  const legacyTeamMatch = variant === "SPORTS_TEAM_MATCH";
  if (!esportsVariant && !legacyTeamMatch)
    return false;
  if (legacyTeamMatch && !resolvePredictGameCodeFromCategoryMeta(category))
    return false;
  if (esportsVariant && !resolvePredictGameCode(category))
    return false;
  const markets = category.markets ?? [];
  return Boolean(
    pickDualTeamMarkets(markets)
    || pickSingleMoneylineMarket(markets)
    || pickChildGameMarkets(markets).length,
  );
}

/**
 * - 旧 SPORTS_TEAM_MATCH：每队一盘 Yes
 * - 新 ESPORTS_*：Match Winner（Map0）+ Game N Winner（Map N）
 */
export function buildPredictMappedMarket(
  category: PredictCategory,
  buyPrices: Record<string, number> = {},
): PredictMappedMarket | null {
  if (!isPredictEsportsMoneylineCategory(category))
    return null;

  const markets = category.markets ?? [];
  const dual = pickDualTeamMarkets(markets);
  const single = dual ? null : pickSingleMoneylineMarket(markets);
  const childGames = dual ? [] : pickChildGameMarkets(markets);
  if (!dual && !single && !childGames.length)
    return null;

  const gameId = resolvePredictGameCode(category);
  if (!gameId)
    return null;

  const categoryId = String(category.slug ?? category.id ?? "");
  const sourceMatchId = String(category.id ?? category.slug ?? categoryId);
  if (!categoryId)
    return null;

  let homeMarketId = "";
  let awayMarketId = "";
  let homeTokenId = "";
  let awayTokenId = "";
  let homeName = "";
  let awayName = "";
  let homeOdds = 0;
  let awayOdds = 0;
  const bets: CollectBetDto[] = [];
  const marketIdSet = new Set<string>();
  const bookMetaByMarketId: Record<string, { yesTokenId: string; decimalPrecision: number }> = {};

  function rememberBookMeta(market: PredictMarket | undefined, marketId: string, yesTok: string) {
    const mid = String(marketId || "").trim();
    if (!mid)
      return;
    const precision = Number(market?.decimalPrecision);
    bookMetaByMarketId[mid] = {
      yesTokenId: String(yesTok || "").trim(),
      decimalPrecision: Number.isFinite(precision) && precision >= 0 ? Math.floor(precision) : 2,
    };
  }

  if (dual) {
    homeMarketId = String(dual.home.id ?? "");
    awayMarketId = String(dual.away.id ?? "");
    homeTokenId = yesOutcomeTokenId(dual.home);
    awayTokenId = yesOutcomeTokenId(dual.away);
    homeName = teamNameOf(dual.home);
    awayName = teamNameOf(dual.away);
    homeOdds = decimalOddsFromProbability(buyPrices[homeMarketId] ?? 0);
    awayOdds = decimalOddsFromProbability(buyPrices[awayMarketId] ?? 0);
    marketIdSet.add(homeMarketId);
    marketIdSet.add(awayMarketId);
    rememberBookMeta(dual.home, homeMarketId, homeTokenId);
    rememberBookMeta(dual.away, awayMarketId, awayTokenId);
    bets.push(buildBetFromDualOutcomes({
      sourceMatchId,
      sourceBetId: categoryId,
      mapNum: 0,
      betName: "Match Winner",
      homeName,
      awayName,
      homeTokenId,
      awayTokenId,
      homeOdds,
      awayOdds,
    }));
  }
  else {
    if (single) {
      homeMarketId = String(single.market.id ?? "");
      awayMarketId = homeMarketId;
      homeTokenId = String(single.homeOutcome.onChainId ?? "");
      awayTokenId = String(single.awayOutcome.onChainId ?? "");
      homeName = outcomeTeamName(single.homeOutcome);
      awayName = outcomeTeamName(single.awayOutcome);
      homeOdds = decimalOddsFromProbability(outcomeProb(single.homeOutcome, buyPrices[homeMarketId] ?? 0));
      awayOdds = decimalOddsFromProbability(outcomeProb(single.awayOutcome, buyPrices[awayMarketId] ?? 0));
      marketIdSet.add(homeMarketId);
      rememberBookMeta(single.market, homeMarketId, yesOutcomeOnChainId(single.market) || homeTokenId);
      bets.push(buildBetFromDualOutcomes({
        sourceMatchId,
        sourceBetId: `${categoryId}#m0`,
        mapNum: 0,
        betName: "Match Winner",
        homeName,
        awayName,
        homeTokenId,
        awayTokenId,
        homeOdds,
        awayOdds,
      }));
      (bets[bets.length - 1] as CollectBetDto & { MarketID?: string }).MarketID = homeMarketId;
    }
    else if (childGames[0]) {
      homeName = outcomeTeamName(childGames[0].homeOutcome);
      awayName = outcomeTeamName(childGames[0].awayOutcome);
      homeTokenId = String(childGames[0].homeOutcome.onChainId ?? "");
      awayTokenId = String(childGames[0].awayOutcome.onChainId ?? "");
      homeMarketId = String(childGames[0].market.id ?? "");
      awayMarketId = homeMarketId;
    }

    for (const child of childGames) {
      const mid = String(child.market.id ?? "");
      const hName = outcomeTeamName(child.homeOutcome);
      const aName = outcomeTeamName(child.awayOutcome);
      const hTok = String(child.homeOutcome.onChainId ?? "");
      const aTok = String(child.awayOutcome.onChainId ?? "");
      const hOdds = decimalOddsFromProbability(outcomeProb(child.homeOutcome, 0));
      const aOdds = decimalOddsFromProbability(outcomeProb(child.awayOutcome, 0));
      const status = String(child.market.status ?? "").toUpperCase();
      const trading = String(child.market.tradingStatus ?? "").toUpperCase();
      const settled = ["RESOLVED", "SETTLED"].includes(status) || trading === "CLOSED";
      if (!hName || !aName || !hTok || !aTok)
        continue;
      if (!homeName) {
        homeName = hName;
        awayName = aName;
        homeTokenId = hTok;
        awayTokenId = aTok;
        homeMarketId = mid;
        awayMarketId = mid;
      }
      marketIdSet.add(mid);
      rememberBookMeta(child.market, mid, yesOutcomeOnChainId(child.market) || hTok);
      bets.push(buildBetFromDualOutcomes({
        sourceMatchId,
        sourceBetId: `${categoryId}#m${child.mapNum}`,
        mapNum: child.mapNum,
        betName: `Game ${child.mapNum} Winner`,
        homeName: hName,
        awayName: aName,
        homeTokenId: hTok,
        awayTokenId: aTok,
        homeOdds: hOdds,
        awayOdds: aOdds,
        forceLocked: settled,
      }));
      (bets[bets.length - 1] as CollectBetDto & { MarketID?: string }).MarketID = mid;
    }
  }

  if (!homeMarketId || !awayMarketId || !homeTokenId || !awayTokenId || !homeName || !awayName)
    return null;
  if (!bets.length)
    return null;

  const matchHomeId = sourceTeamId(gameId, homeName);
  const matchAwayId = sourceTeamId(gameId, awayName);
  const startTime = startTimeOf(category);
  const map0 = bets.find(b => Number(b.Map) === 0) || bets[0];

  return {
    categoryId,
    homeMarketId,
    awayMarketId,
    homeTokenId,
    awayTokenId,
    marketIds: [...marketIdSet],
    bookMetaByMarketId,
    match: {
      Type: PLATFORM,
      SourceMatchID: sourceMatchId,
      SourceGameID: gameId,
      StartTime: startTime,
      HomeID: matchHomeId,
      Home: homeName,
      AwayID: matchAwayId,
      Away: awayName,
      Teams: [
        { Type: PLATFORM, TeamID: matchHomeId, Name: homeName, GameID: gameId, Logo: "" },
        { Type: PLATFORM, TeamID: matchAwayId, Name: awayName, GameID: gameId, Logo: "" },
      ],
    },
    bet: map0,
    bets,
  };
}

