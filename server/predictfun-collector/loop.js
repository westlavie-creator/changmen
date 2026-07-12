import { replacePlatformBetsForMatch, writePlatformMatches } from "@changmen/db";
import { formatBetOdds } from "@changmen/shared/odds_format";

import {
  fetchPredictCategories,
  fetchPredictOrderbooks,
  predictCollectStartTimeAllowed,
  resolvePredictFunApiKey,
} from "./api.js";
import { persistPredictFunMarketIndex } from "./market_index.js";
import {
  bestAskFromPredictBook,
  buildPredictMappedMarket,
  isPredictEsportsMoneylineCategory,
} from "./parse.js";

const PLATFORM = "PredictFun";
const MAX_TRACKED_MARKETS = 200;

export async function runPredictFunDiscoveryCycle() {
  if (!resolvePredictFunApiKey())
    throw new Error("PREDICT_FUN_API_KEY 未配置");

  const rawCategories = await fetchPredictCategories({
    marketVariant: "SPORTS_TEAM_MATCH",
    status: "OPEN",
  });
  const filtered = rawCategories.filter((category) => {
    if (!isPredictEsportsMoneylineCategory(category))
      return false;
    const startMs = category.startsAt ? Date.parse(category.startsAt) : 0;
    return predictCollectStartTimeAllowed(startMs);
  });

  const marketIds = [];
  for (const category of filtered) {
    for (const market of category.markets ?? []) {
      if (market.id != null)
        marketIds.push(String(market.id));
    }
  }

  const books = await fetchPredictOrderbooks(marketIds);
  const buyPrices = {};
  for (const [id, book] of Object.entries(books)) {
    const ask = bestAskFromPredictBook(book);
    if (ask > 0 && ask < 1)
      buyPrices[id] = ask;
  }

  const candidates = [];
  for (const category of filtered) {
    const mapped = buildPredictMappedMarket(category, buyPrices);
    if (mapped)
      candidates.push(mapped);
    if (candidates.length >= MAX_TRACKED_MARKETS)
      break;
  }

  if (!candidates.length) {
    writePlatformMatches(PLATFORM, []);
    persistPredictFunMarketIndex([]);
    return { matches: 0, bets: 0 };
  }

  const matches = [...new Map(
    candidates.map(row => [String(row.match.SourceMatchID), row.match]),
  ).values()];
  writePlatformMatches(PLATFORM, matches);

  for (const mapped of candidates) {
    const bet = formatBetOdds(mapped.bet);
    replacePlatformBetsForMatch(PLATFORM, mapped.match.SourceMatchID, [bet]);
  }

  persistPredictFunMarketIndex(candidates);

  return { matches: matches.length, bets: candidates.length };
}
