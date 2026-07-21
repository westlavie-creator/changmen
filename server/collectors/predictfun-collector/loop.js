import { replacePlatformBetsForMatch, writePlatformMatches } from "@changmen/db";
import { formatPredictionMarketBetOdds } from "@changmen/shared/odds_format";

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

  // 默认 tagIds=Esports（见 api.js）；覆盖旧 SPORTS_TEAM_MATCH→MLB 误拉
  const rawCategories = await fetchPredictCategories({ status: "OPEN" });
  const esportCategories = rawCategories.filter(isPredictEsportsMoneylineCategory);
  const filtered = esportCategories.filter((category) => {
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
    // 与 polymarket-esports 同口径：过滤后 0 不 clear，避免稀疏赛程/时间窗外误抹库
    console.warn(
      `[predictfun-collector] skip write: raw=${rawCategories.length} esport=${esportCategories.length} inWindow=${filtered.length} mapped=0`,
    );
    return {
      matches: 0,
      bets: 0,
      raw: rawCategories.length,
      esport: esportCategories.length,
      inWindow: filtered.length,
      skippedClear: true,
    };
  }

  const matches = [...new Map(
    candidates.map(row => [String(row.match.SourceMatchID), row.match]),
  ).values()];
  writePlatformMatches(PLATFORM, matches);

  for (const mapped of candidates) {
    const list = Array.isArray(mapped.bets) && mapped.bets.length
      ? mapped.bets
      : [mapped.bet];
    const bets = list.map(bet => formatPredictionMarketBetOdds(bet));
    replacePlatformBetsForMatch(PLATFORM, mapped.match.SourceMatchID, bets);
  }

  persistPredictFunMarketIndex(candidates, books);

  const betCount = candidates.reduce((n, mapped) => {
    const list = Array.isArray(mapped.bets) && mapped.bets.length
      ? mapped.bets
      : (mapped.bet ? [mapped.bet] : []);
    return n + list.length;
  }, 0);

  return {
    matches: matches.length,
    bets: betCount,
    raw: rawCategories.length,
    esport: esportCategories.length,
    inWindow: filtered.length,
  };
}
