/**
 * PredictFun 电竞 discovery 解析（**权威实现**）。
 * VPS collector：categories → orderbook → platform_* + MarketIndex。
 * 浏览器不跑本文件；client `venue-adapter/predictfun/parse.ts` 只做行情工具 + 测试镜像（对齐 PM）。
 *
 * 官方电竞现形态：
 * - marketVariant: ESPORTS_LOL / ESPORTS_CS2 / …
 * - 单盘 SPORTS_MONEYLINE「Match Winner」+ 双 outcome（队名在 variantData.team）
 * - market.status 多为 REGISTERED + tradingStatus OPEN
 *
 * 仍兼容旧 SPORTS_TEAM_MATCH（每队一盘 Yes）。
 */

import { truncateOddsTo3 } from "@changmen/shared/odds_format";

const PLATFORM = "PredictFun";

const ESPORT_TAG_RE = /\b(cs2|counter[- ]?strike|lol|league[- ]?of[- ]?legends|dota-?2|valorant|esport|esports)\b/i;
const ESPORT_LEAGUE_RE = /\b(cs2|counter[- ]?strike|lol|league[- ]?of[- ]?legends|dota-?2|valorant|lck|lpl|lec|lcs|vct|blast|iem|esl)\b/i;

export function mapPredictEsportTag(name) {
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

export function resolvePredictGameCodeFromVariant(variant) {
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

function resolvePredictGameCodeFromCategoryMeta(category) {
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

export function resolvePredictGameCode(category) {
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

export function isTradablePredictMarket(market) {
  const trading = String(market.tradingStatus ?? "OPEN").toUpperCase();
  if (trading && !["OPEN", "MATCHING_NOT_PAUSED"].includes(trading))
    return false;
  const status = String(market.status ?? "").toUpperCase();
  // 电竞/运动盘：REGISTERED / PRICE_PROPOSED + trading OPEN
  if (status && !["OPEN", "REGISTERED", "PRICE_PROPOSED"].includes(status))
    return false;
  return true;
}

/** 局盘可入库（含已结算 → Locked） */
function isCollectableChildMoneyline(market) {
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

/** "Game 3 Winner" / "Map 2 Winner" → N；其它标题 → 0 */
export function parsePredictGameMapNumber(title) {
  const m = String(title ?? "").trim().match(/^(?:Game|Map)\s+(\d+)\s+Winner$/i);
  if (!m)
    return 0;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function isDualTeamMoneylineMarket(market) {
  if (!isTradablePredictMarket(market))
    return false;
  if (market.marketType && market.marketType !== "SPORTS_MONEYLINE")
    return false;
  const title = String(market.title ?? market.team?.name ?? "").trim().toLowerCase();
  if (!title || title === "draw" || title === "tie" || title === "match winner")
    return false;
  return Boolean(market.team?.name || (title && title !== "match winner"));
}

export function readPredictTopPrice(level) {
  if (level == null)
    return 0;
  if (typeof level === "number")
    return Number.isFinite(level) && level > 0 && level < 1 ? level : 0;
  if (typeof level === "string") {
    const n = Number(level);
    return Number.isFinite(n) && n > 0 && n < 1 ? n : 0;
  }
  if (typeof level === "object") {
    const n = Number(level.price);
    return Number.isFinite(n) && n > 0 && n < 1 ? n : 0;
  }
  return 0;
}

export function outcomeProb(outcome, bookProb = 0) {
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

export function outcomeTeamName(outcome) {
  return String(
    outcome?.team?.name
    ?? outcome?.variantData?.team?.name
    ?? "",
  ).trim();
}

/**
 * 全场 Match Winner 的 outcome.name（如 NEM）→ 队名。
 * PF 局盘 Map N Winner 常只有 abbreviation、没有 team 字段。
 */
function buildOutcomeAbbrTeamMap(markets) {
  /** @type {Map<string, string>} */
  const map = new Map();
  for (const market of markets || []) {
    if (String(market?.marketType ?? "") !== "SPORTS_MONEYLINE")
      continue;
    for (const outcome of market.outcomes ?? []) {
      const team = outcomeTeamName(outcome);
      if (!team)
        continue;
      const nameKey = String(outcome?.name ?? "").trim().toUpperCase();
      if (nameKey)
        map.set(nameKey, team);
      const abbr = String(
        outcome?.team?.abbreviation
        ?? outcome?.variantData?.team?.abbreviation
        ?? "",
      ).trim().toUpperCase();
      if (abbr)
        map.set(abbr, team);
    }
  }
  return map;
}

function resolveChildOutcomeTeamName(outcome, abbrTeamMap) {
  const direct = outcomeTeamName(outcome);
  if (direct)
    return direct;
  const key = String(outcome?.name ?? "").trim().toUpperCase();
  if (!key)
    return "";
  return abbrTeamMap.get(key) || "";
}

export function normalizePredictTeamName(name) {
  const normalized = String(name || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\u4E00-\u9FFF]+/gi, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "unknown";
}

export function sourceTeamId(gameId, name) {
  return `${gameId}:${normalizePredictTeamName(name)}`;
}

export function decimalOddsFromProbability(price) {
  const value = Number(price);
  if (!Number.isFinite(value) || value <= 0 || value >= 1)
    return 0;
  return truncateOddsTo3(1 / value);
}

export function bestAskFromPredictBook(book) {
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

/** [Predict 官方] Yes + No = 1（按 decimalPrecision）；禁止裸 1-price */
export function getPredictComplement(price, decimalPrecision = 2) {
  const precision = Number.isFinite(decimalPrecision) && decimalPrecision >= 0
    ? Math.floor(Number(decimalPrecision))
    : 2;
  const factor = 10 ** precision;
  const raw = Number(price);
  if (!Number.isFinite(raw))
    return NaN;
  return (factor - Math.round(raw * factor)) / factor;
}

function normalizeBookLevels(levels) {
  const out = [];
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

export function orderbookForOutcomeBuy(yesBook, opts) {
  const yesAsks = normalizeBookLevels(yesBook?.asks);
  const yesBids = normalizeBookLevels(yesBook?.bids);
  if (opts?.isYesOutcome) {
    return {
      marketId: yesBook?.marketId,
      updateTimestampMs: yesBook?.updateTimestampMs,
      asks: [...yesAsks].sort((a, b) => a[0] - b[0]),
      bids: [...yesBids].sort((a, b) => b[0] - a[0]),
    };
  }
  const precision = Number.isFinite(opts?.decimalPrecision)
    ? Number(opts.decimalPrecision)
    : 2;
  const noAsks = yesBids.map(([p, q]) => [getPredictComplement(p, precision), q]);
  const noBids = yesAsks.map(([p, q]) => [getPredictComplement(p, precision), q]);
  return {
    marketId: yesBook?.marketId,
    updateTimestampMs: yesBook?.updateTimestampMs,
    asks: normalizeBookLevels(noAsks).sort((a, b) => a[0] - b[0]),
    bids: normalizeBookLevels(noBids).sort((a, b) => b[0] - a[0]),
  };
}

export function predictBuyAskFromYesBook(yesBook, isYesOutcome, decimalPrecision = 2) {
  return bestAskFromPredictBook(orderbookForOutcomeBuy(yesBook, {
    isYesOutcome,
    decimalPrecision,
  }));
}

/** token 是否对应官方 orderbook 的 Yes 侧 */
export function isPredictYesOutcomeToken(tokenId, outcomes) {
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
 * 可执行买入概率：优先官方 Yes orderbook（No 侧 getComplement）；
 * 无 book 时仅 Yes 可用 marketYesAsk；禁止把 Yes ask 塞给 No 当 bookProb。
 * 过薄档（≤0.02 / ≥0.98）视为不可用 → 0（避免 UI 出现 100/1.01 假可买）。
 */
export function resolvePredictOutcomeBuyProb(opts) {
  const market = opts?.market;
  const outcome = opts?.outcome;
  const mid = String(market?.id ?? "").trim();
  const tok = String(outcome?.onChainId ?? "").trim();
  const precisionRaw = Number(market?.decimalPrecision);
  const precision = Number.isFinite(precisionRaw) && precisionRaw >= 0
    ? Math.floor(precisionRaw)
    : 2;
  const isYes = tok
    ? isPredictYesOutcomeToken(tok, market?.outcomes)
    : true;

  function usableBuyProb(p) {
    const n = Number(p);
    if (!(n > 0.02 && n < 0.98))
      return 0;
    return n;
  }

  const book = mid && opts?.orderbooks ? opts.orderbooks[mid] : undefined;
  if (book) {
    const fromBook = predictBuyAskFromYesBook(book, isYes, precision);
    const usable = usableBuyProb(fromBook);
    if (usable > 0)
      return usable;
    // 已拉到 Yes book 但本侧无深度/过薄：勿回落 category outcome.bestAsk
    return 0;
  }

  if (isYes && mid) {
    const yesAsk = usableBuyProb(opts?.marketYesAsk?.[mid]);
    if (yesAsk > 0)
      return yesAsk;
  }

  return usableBuyProb(outcomeProb(outcome, 0));
}

export function yesOutcomeOnChainId(market) {
  const outcomes = market?.outcomes ?? [];
  const yes = outcomes.find((o) => {
    const name = String(o?.name ?? "").trim().toLowerCase();
    if (name === "yes")
      return true;
    return Number(o?.indexSet) === 1;
  }) ?? outcomes[0];
  return String(yes?.onChainId ?? "").trim();
}

function yesOutcomeTokenId(market) {
  return yesOutcomeOnChainId(market);
}

function teamNameOf(market) {
  return String(market.team?.name ?? market.title ?? "").trim();
}

function startTimeOf(category) {
  const raw = category.startsAt;
  if (raw) {
    const ms = Date.parse(raw);
    if (Number.isFinite(ms))
      return ms;
  }
  return Date.now();
}

/** 旧形态：每队一盘 */
function pickDualTeamMarkets(markets) {
  const teamMarkets = markets.filter(isDualTeamMoneylineMarket);
  if (teamMarkets.length < 2)
    return null;
  const [home, away] = teamMarkets.slice(0, 2);
  if (!teamNameOf(home) || !teamNameOf(away))
    return null;
  return { mode: "dual", home, away };
}

/** 新形态：单盘 Match Winner + 双 outcome */
function pickSingleMoneylineMarket(markets) {
  const tradable = markets.filter(isTradablePredictMarket);
  const ml = tradable.find(m => String(m.marketType ?? "") === "SPORTS_MONEYLINE")
    || tradable.find(m => (m.outcomes ?? []).length >= 2 && parsePredictGameMapNumber(m.title) === 0);
  if (!ml)
    return null;
  const outcomes = ml.outcomes ?? [];
  if (outcomes.length < 2)
    return null;
  const withTeam = outcomes.filter(o => outcomeTeamName(o));
  const homeOutcome = withTeam[0] || null;
  const awayOutcome = withTeam[1] || null;
  if (!homeOutcome || !awayOutcome)
    return null;
  return { mode: "single", market: ml, homeOutcome, awayOutcome };
}

/** Game/Map N Winner 局盘（队名可从全场 abbreviation 回填） */
function pickChildGameMarkets(markets) {
  const abbrTeamMap = buildOutcomeAbbrTeamMap(markets);
  const out = [];
  for (const market of markets || []) {
    if (!isCollectableChildMoneyline(market))
      continue;
    const mapNum = parsePredictGameMapNumber(market.title);
    if (mapNum <= 0)
      continue;
    const outcomes = market.outcomes ?? [];
    if (outcomes.length < 2)
      continue;
    // 优先带 team 字段的 outcome；否则按顺序取两侧并用 abbr→队名回填
    const withTeam = outcomes.filter(o => resolveChildOutcomeTeamName(o, abbrTeamMap));
    const homeOutcome = withTeam[0] || outcomes[0] || null;
    const awayOutcome = withTeam[1] || outcomes[1] || null;
    if (!homeOutcome || !awayOutcome)
      continue;
    const homeName = resolveChildOutcomeTeamName(homeOutcome, abbrTeamMap);
    const awayName = resolveChildOutcomeTeamName(awayOutcome, abbrTeamMap);
    if (!homeName || !awayName)
      continue;
    out.push({ mapNum, market, homeOutcome, awayOutcome, homeName, awayName });
  }
  return out.sort((a, b) => a.mapNum - b.mapNum);
}

function buildBetFromDualOutcomes({
  sourceMatchId,
  sourceBetId,
  mapNum,
  betName,
  homeName,
  awayName,
  homeTokenId,
  awayTokenId,
  homeOdds,
  awayOdds,
  forceLocked = false,
}) {
  const locked = forceLocked || !homeOdds || !awayOdds;
  return {
    Type: PLATFORM,
    SourceMatchID: sourceMatchId,
    SourceBetID: sourceBetId,
    Map: mapNum,
    BetName: betName,
    SourceHomeID: homeTokenId,
    HomeName: homeName,
    HomeOdds: homeOdds,
    SourceAwayID: awayTokenId,
    AwayName: awayName,
    AwayOdds: awayOdds,
    Status: locked ? "Locked" : "Normal",
  };
}

export function isPredictEsportsMoneylineCategory(category) {
  if (String(category.status ?? "").toUpperCase() !== "OPEN")
    return false;
  const variant = String(category.marketVariant ?? "");
  const esportsVariant = variant.startsWith("ESPORTS_");
  const legacyTeamMatch = variant === "SPORTS_TEAM_MATCH";
  if (!esportsVariant && !legacyTeamMatch)
    return false;
  // 旧 TEAM_MATCH：只认分类 tags/teams，避免 Politics 等被 market.team.league 误放行
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

export function buildPredictMappedMarket(category, buyPrices = {}, orderbooks = {}) {
  if (!isPredictEsportsMoneylineCategory(category))
    return null;

  const markets = category.markets ?? [];
  const dual = pickDualTeamMarkets(markets);
  const single = dual ? null : pickSingleMoneylineMarket(markets);
  // dual 全场（每队一盘）仍可能挂 Map/Game N Winner 子盘，不能因 dual 丢掉局盘
  const childGames = pickChildGameMarkets(markets);
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
  /** @type {ReturnType<typeof buildBetFromDualOutcomes>[]} */
  const bets = [];
  /** @type {Record<string, { yesTokenId: string, decimalPrecision: number }>} */
  const bookMetaByMarketId = {};

  function rememberBookMeta(market, marketId, yesTok) {
    const mid = String(marketId || "").trim();
    if (!mid)
      return;
    const precision = Number(market?.decimalPrecision);
    bookMetaByMarketId[mid] = {
      yesTokenId: String(yesTok || "").trim(),
      decimalPrecision: Number.isFinite(precision) && precision >= 0 ? Math.floor(precision) : 2,
    };
  }

  function oddsForOutcome(market, outcome) {
    return decimalOddsFromProbability(resolvePredictOutcomeBuyProb({
      market,
      outcome,
      orderbooks,
      marketYesAsk: buyPrices,
    }));
  }

  /** 每队一盘：该盘 Yes token 的可买价 */
  function oddsForDualMarketYes(market) {
    const mid = String(market.id ?? "").trim();
    const yesTok = yesOutcomeOnChainId(market);
    const yesOutcome = (market.outcomes ?? []).find(
      o => String(o?.onChainId ?? "").trim() === yesTok,
    ) ?? market.outcomes?.[0];
    if (yesOutcome)
      return oddsForOutcome(market, yesOutcome);
    const book = mid ? orderbooks[mid] : undefined;
    const fromBook = book ? bestAskFromPredictBook(book) : 0;
    if (fromBook > 0 && fromBook < 1)
      return decimalOddsFromProbability(fromBook);
    return decimalOddsFromProbability(buyPrices[mid] ?? 0);
  }

  if (dual) {
    homeMarketId = String(dual.home.id ?? "");
    awayMarketId = String(dual.away.id ?? "");
    homeTokenId = yesOutcomeTokenId(dual.home);
    awayTokenId = yesOutcomeTokenId(dual.away);
    homeName = teamNameOf(dual.home);
    awayName = teamNameOf(dual.away);
    homeOdds = oddsForDualMarketYes(dual.home);
    awayOdds = oddsForDualMarketYes(dual.away);
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
  else if (single) {
    homeMarketId = String(single.market.id ?? "");
    awayMarketId = homeMarketId;
    homeTokenId = String(single.homeOutcome.onChainId ?? "");
    awayTokenId = String(single.awayOutcome.onChainId ?? "");
    homeName = outcomeTeamName(single.homeOutcome);
    awayName = outcomeTeamName(single.awayOutcome);
    homeOdds = oddsForOutcome(single.market, single.homeOutcome);
    awayOdds = oddsForOutcome(single.market, single.awayOutcome);
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
    bets[bets.length - 1].MarketID = homeMarketId;
  }
  else if (childGames[0]) {
    // 仅有局盘时用 Map1 队名定主客
    homeName = childGames[0].homeName;
    awayName = childGames[0].awayName;
    homeTokenId = String(childGames[0].homeOutcome.onChainId ?? "");
    awayTokenId = String(childGames[0].awayOutcome.onChainId ?? "");
    homeMarketId = String(childGames[0].market.id ?? "");
    awayMarketId = homeMarketId;
  }

  for (const child of childGames) {
    const mid = String(child.market.id ?? "");
    const hName = child.homeName;
    const aName = child.awayName;
    const hTok = String(child.homeOutcome.onChainId ?? "");
    const aTok = String(child.awayOutcome.onChainId ?? "");
    const hOdds = oddsForOutcome(child.market, child.homeOutcome);
    const aOdds = oddsForOutcome(child.market, child.awayOutcome);
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
    rememberBookMeta(child.market, mid, yesOutcomeOnChainId(child.market) || hTok);
    bets.push(buildBetFromDualOutcomes({
      sourceMatchId,
      sourceBetId: `${categoryId}#m${child.mapNum}`,
      mapNum: child.mapNum,
      betName: `Map ${child.mapNum} Winner`,
      homeName: hName,
      awayName: aName,
      homeTokenId: hTok,
      awayTokenId: aTok,
      homeOdds: hOdds,
      awayOdds: aOdds,
      forceLocked: settled,
    }));
    bets[bets.length - 1].MarketID = mid;
  }

  if (!homeMarketId || !awayMarketId || !homeTokenId || !awayTokenId || !homeName || !awayName)
    return null;
  if (!bets.length)
    return null;

  const matchHomeId = sourceTeamId(gameId, homeName);
  const matchAwayId = sourceTeamId(gameId, awayName);
  const startTime = startTimeOf(category);

  const homeTeam = {
    Type: PLATFORM,
    TeamID: matchHomeId,
    Name: homeName,
    GameID: gameId,
    Logo: "",
  };
  const awayTeam = {
    Type: PLATFORM,
    TeamID: matchAwayId,
    Name: awayName,
    GameID: gameId,
    Logo: "",
  };

  const map0 = bets.find(b => Number(b.Map) === 0) || bets[0];
  const marketIds = [...new Set(
    [homeMarketId, awayMarketId, ...bets.map(b => String(b.MarketID || "")).filter(Boolean)],
  )];

  return {
    categoryId,
    homeMarketId,
    awayMarketId,
    homeTokenId,
    awayTokenId,
    marketIds,
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
      Teams: [homeTeam, awayTeam],
    },
    /** @deprecated 兼容 market_index：全场或首条 */
    bet: map0,
    bets,
  };
}

