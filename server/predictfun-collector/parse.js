/**
 * Predict.fun 解析（与 client/venue-adapter/predictfun/parse.ts 对齐）
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

export function resolvePredictGameCode(category) {
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
  return null;
}

function isOpenTradingMarket(market) {
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

export function isPredictEsportsMoneylineCategory(category) {
  if (category.marketVariant !== "SPORTS_TEAM_MATCH")
    return false;
  if (String(category.status ?? "").toUpperCase() !== "OPEN")
    return false;
  if (!resolvePredictGameCodeFromCategoryMeta(category))
    return false;
  const teamMarkets = (category.markets ?? []).filter(isOpenTradingMarket);
  return teamMarkets.length >= 2;
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

function yesOutcomeTokenId(market) {
  const outcomes = market.outcomes ?? [];
  const yes = outcomes.find(o => String(o.name ?? "").toLowerCase() === "yes") ?? outcomes[0];
  return String(yes?.onChainId ?? "");
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

function pickHomeAwayMarkets(markets) {
  const teamMarkets = markets.filter(isOpenTradingMarket);
  if (teamMarkets.length < 2)
    return null;
  const [home, away] = teamMarkets.slice(0, 2);
  if (!teamNameOf(home) || !teamNameOf(away))
    return null;
  return { home, away };
}

export function buildPredictMappedMarket(category, buyPrices = {}) {
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
      HomeID: matchHomeId,
      Home: homeName,
      AwayID: matchAwayId,
      Away: awayName,
      Teams: [homeTeam, awayTeam],
    },
    bet: {
      Type: PLATFORM,
      SourceMatchID: sourceMatchId,
      SourceBetID: categoryId,
      Map: 0,
      BetName: "Match Winner",
      SourceHomeID: homeTokenId,
      HomeName: homeName,
      HomeOdds: homeOdds,
      SourceAwayID: awayTokenId,
      AwayName: awayName,
      AwayOdds: awayOdds,
      Status: locked ? "Locked" : "Normal",
    },
  };
}
