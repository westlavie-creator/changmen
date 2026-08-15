/**
 * PredictFun 电竞 discovery 解析（**唯一权威**）。
 * VPS collector：categories → orderbook → platform_* + MarketIndex。
 * 浏览器不跑本文件；`client/venue-adapter/predictfun/parse.ts` **只**保留报价工具
 * （complement / Yes book→token），禁止再镜像 `buildPredictMappedMarket`。
 *
 * 官方电竞现形态：
 * - marketVariant: ESPORTS_LOL / ESPORTS_CS2 / …
 * - 单盘 SPORTS_MONEYLINE「Match Winner」+ 双 outcome（队名在 outcome.team /
 *   outcome.variantDetails.sports.team；category.variantDetails.sports.teams 为字典）
 * - Game/Map N Winner → SPORTS_CHILD_MONEYLINE
 * - First Blood / Totals 等 prop：常为 marketType=null，禁止当主客队
 * - market.status 多为 REGISTERED + tradingStatus OPEN
 *
 * 仍兼容旧 SPORTS_TEAM_MATCH（每队一盘 Yes，须 market.team）。
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
  // 注意：Match Winner 的 PRICE_PROPOSED 表示赛果提案中 → 列表 discovery 另见
  // isPredictCategoryOpenForCollect（停写），此处仍允许读局盘结算态。
  if (status && !["OPEN", "REGISTERED", "PRICE_PROPOSED"].includes(status))
    return false;
  return true;
}

/**
 * 市场进入结算/提案/关闭：不再适合「未结束比赛」列表。
 * PRICE_PROPOSED = 官方提案结算价（赛已实质结束，category 仍常为 OPEN）。
 */
export function isPredictMarketResolvingOrSettled(market) {
  if (!market || typeof market !== "object")
    return false;
  const status = String(market.status ?? "").toUpperCase();
  const trading = String(market.tradingStatus ?? "").toUpperCase();
  if (["RESOLVED", "SETTLED", "PRICE_PROPOSED"].includes(status))
    return true;
  if (trading === "CLOSED")
    return true;
  return false;
}

/** 全场 Match Winner（SPORTS_MONEYLINE）；不要求 tradable，便于识别 PRICE_PROPOSED。 */
export function findPredictMatchWinnerMarket(markets) {
  const list = Array.isArray(markets) ? markets : [];
  const moneyline = list.filter(m => String(m?.marketType ?? "") === "SPORTS_MONEYLINE");
  const byTitle = moneyline.find(
    m => String(m?.title ?? "").trim().toLowerCase() === "match winner",
  );
  if (byTitle)
    return byTitle;
  // 旧 dual：每队一盘（title=队名 + market.team），禁止把单队盘当成全场 ML
  const teamNamed = moneyline.filter(m => String(m?.team?.name ?? "").trim());
  if (teamNamed.length >= 2)
    return null;
  // 仅当全场只剩一块 SPORTS_MONEYLINE 时才回落
  return moneyline.length === 1 ? moneyline[0] : null;
}

/**
 * 源头门控：category 仍 OPEN，但全场盘已提案/结算 → 停采集、可 prune。
 * - 有 Match Winner：看该盘
 * - 旧 dual（每队一盘）：两侧都 resolving/settled 才停
 */
export function isPredictCategoryOpenForCollect(category) {
  if (!category || typeof category !== "object")
    return false;
  if (String(category.status ?? "").toUpperCase() !== "OPEN")
    return false;
  const markets = category.markets ?? [];
  const ml = findPredictMatchWinnerMarket(markets);
  if (ml)
    return !isPredictMarketResolvingOrSettled(ml);

  const dualMl = markets.filter(m =>
    String(m?.marketType ?? "") === "SPORTS_MONEYLINE"
    && String(m?.team?.name ?? "").trim(),
  );
  if (dualMl.length >= 2) {
    if (dualMl.every(isPredictMarketResolvingOrSettled))
      return false;
    return true;
  }
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

/**
 * 旧形态「每队一盘」(SportsMatch team-win)。
 * 官方：`market.team` 标记该盘关于哪支队；禁止用 `market.title` 冒充队名
 * （否则 First Blood / Totals 等 `marketType=null` 的 prop 会进 dual）。
 */
function isDualTeamMoneylineMarket(market) {
  if (!isTradablePredictMarket(market))
    return false;
  const teamName = String(market?.team?.name ?? "").trim();
  if (!teamName)
    return false;
  const mt = String(market.marketType ?? "");
  // 有 marketType 时必须是 MONEYLINE；null 仅兼容极旧盘（仍须有 team）
  if (mt && mt !== "SPORTS_MONEYLINE")
    return false;
  const title = String(market.title ?? "").trim().toLowerCase();
  if (title === "draw" || title === "tie" || title === "match winner")
    return false;
  return true;
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
    // 官方新字段：outcome.variantDetails.sports.team（与 deprecated variantData 并存）
    ?? outcome?.variantDetails?.sports?.team?.name
    ?? "",
  ).trim();
}

/** category.variantDetails.sports.teams（官方 SportsCategoryDetails） */
export function categorySportsTeams(category) {
  const fromDetails = category?.variantDetails?.sports?.teams;
  if (Array.isArray(fromDetails) && fromDetails.length)
    return fromDetails;
  const deprecated = category?.teams;
  return Array.isArray(deprecated) ? deprecated : [];
}

function rememberAbbrTeam(map, key, teamName) {
  const k = String(key ?? "").trim().toUpperCase();
  const name = String(teamName ?? "").trim();
  if (!k || !name)
    return;
  if (!map.has(k))
    map.set(k, name);
}

/**
 * 全场 Match Winner 的 outcome.name / abbreviation → 队名。
 * PF 局盘 Map N Winner 常只有 abbreviation、没有 team 字段。
 * 另合并 category.variantDetails.sports.teams（官方队名字典）。
 */
function buildOutcomeAbbrTeamMap(markets, category) {
  /** @type {Map<string, string>} */
  const map = new Map();
  for (const market of markets || []) {
    if (String(market?.marketType ?? "") !== "SPORTS_MONEYLINE")
      continue;
    for (const outcome of market.outcomes ?? []) {
      const team = outcomeTeamName(outcome);
      if (!team)
        continue;
      rememberAbbrTeam(map, outcome?.name, team);
      rememberAbbrTeam(
        map,
        outcome?.team?.abbreviation
          ?? outcome?.variantData?.team?.abbreviation
          ?? outcome?.variantDetails?.sports?.team?.abbreviation,
        team,
      );
    }
  }
  for (const t of categorySportsTeams(category)) {
    const name = String(t?.name ?? "").trim();
    if (!name)
      continue;
    rememberAbbrTeam(map, t?.abbreviation, name);
    rememberAbbrTeam(map, name, name);
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
  // dual 路径只认官方 market.team，禁止 title 回退（prop 标题会污染主客）
  return String(market?.team?.name ?? "").trim();
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

/** 旧形态：每队一盘（须 market.team） */
function pickDualTeamMarkets(markets) {
  const teamMarkets = markets.filter(isDualTeamMoneylineMarket);
  if (teamMarkets.length < 2)
    return null;
  const [home, away] = teamMarkets.slice(0, 2);
  if (!teamNameOf(home) || !teamNameOf(away))
    return null;
  return { mode: "dual", home, away };
}

/**
 * 新形态：单盘 Match Winner + 双 outcome。
 * 队名：outcome.team / variantDetails；缺省时用 category.variantDetails.sports.teams 按序兜底。
 * 只认 marketType=SPORTS_MONEYLINE（排除 First Blood 等 marketType=null 的 prop）。
 */
function pickSingleMoneylineMarket(markets, category) {
  const tradable = markets.filter(isTradablePredictMarket);
  const moneyline = tradable.filter(m => String(m.marketType ?? "") === "SPORTS_MONEYLINE");
  const ml = moneyline.find(m => String(m.title ?? "").trim().toLowerCase() === "match winner")
    || moneyline[0]
    || null;
  if (!ml)
    return null;
  const outcomes = ml.outcomes ?? [];
  if (outcomes.length < 2)
    return null;

  const abbrTeamMap = buildOutcomeAbbrTeamMap(markets, category);
  const catTeams = categorySportsTeams(category);

  function resolveSideName(outcome, sideIndex) {
    const fromOutcome = resolveChildOutcomeTeamName(outcome, abbrTeamMap);
    if (fromOutcome)
      return fromOutcome;
    const fallback = catTeams[sideIndex];
    return String(fallback?.name ?? "").trim();
  }

  const homeOutcome = outcomes[0];
  const awayOutcome = outcomes[1];
  const homeName = resolveSideName(homeOutcome, 0);
  const awayName = resolveSideName(awayOutcome, 1);
  if (!homeOutcome || !awayOutcome || !homeName || !awayName)
    return null;
  return {
    mode: "single",
    market: ml,
    homeOutcome,
    awayOutcome,
    homeName,
    awayName,
  };
}

/** Game/Map N Winner 局盘（队名可从全场 abbreviation / variantDetails 回填） */
function pickChildGameMarkets(markets, category) {
  const abbrTeamMap = buildOutcomeAbbrTeamMap(markets, category);
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
    pickSingleMoneylineMarket(markets, category)
    || pickDualTeamMarkets(markets)
    || pickChildGameMarkets(markets, category).length,
  );
}

export function buildPredictMappedMarket(category, buyPrices = {}, orderbooks = {}) {
  if (!isPredictEsportsMoneylineCategory(category))
    return null;

  const markets = category.markets ?? [];
  // 优先 Match Winner（single）；dual 仅旧「每队一盘」。避免 First Blood 等 prop 抢 dual。
  const single = pickSingleMoneylineMarket(markets, category);
  const dual = single ? null : pickDualTeamMarkets(markets);
  // dual 全场（每队一盘）仍可能挂 Map/Game N Winner 子盘，不能因 dual 丢掉局盘
  const childGames = pickChildGameMarkets(markets, category);
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

  if (single) {
    homeMarketId = String(single.market.id ?? "");
    awayMarketId = homeMarketId;
    homeTokenId = String(single.homeOutcome.onChainId ?? "");
    awayTokenId = String(single.awayOutcome.onChainId ?? "");
    homeName = single.homeName;
    awayName = single.awayName;
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
  else if (dual) {
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

