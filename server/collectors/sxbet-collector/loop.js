import {
  deleteOrphanPlatformBetsAsync,
  replacePlatformBetsForMatchAsync,
  writePlatformMatchesAsync,
} from "@changmen/db";
import { formatBetOdds } from "@changmen/shared/odds_format";

import {
  SXBET_USDC,
  fetchSxActiveEsportsMoneylineMarkets,
  fetchSxBestOdds,
  sxbetCollectStartTimeAllowed,
} from "./api.js";
import { persistSxBetMarketIndex } from "./market_index.js";
import { buildSxMappedMarket } from "./parse.js";

const PLATFORM = "SXBet";
const MAX_TRACKED_MARKETS = 200;

export async function runSxBetDiscoveryCycle() {
  const rawMarkets = await fetchSxActiveEsportsMoneylineMarkets();
  const filtered = rawMarkets.filter((market) => {
    const startMs = Number(market.gameTime) > 0 ? Number(market.gameTime) * 1000 : 0;
    return sxbetCollectStartTimeAllowed(startMs);
  });

  if (!filtered.length) {
    console.warn(
      `[sxbet-collector] skip write: raw=${rawMarkets.length} inWindow=0 mapped=0`,
    );
    return {
      matches: 0,
      bets: 0,
      raw: rawMarkets.length,
      inWindow: 0,
      skippedClear: true,
    };
  }

  const hashes = filtered
    .map(row => String(row.marketHash ?? ""))
    .filter(Boolean)
    .slice(0, MAX_TRACKED_MARKETS);
  const bestOdds = await fetchSxBestOdds(hashes, SXBET_USDC);

  const candidates = [];
  for (const market of filtered) {
    const hash = String(market.marketHash ?? "");
    const mapped = buildSxMappedMarket(market, bestOdds[hash]);
    if (mapped)
      candidates.push(mapped);
    if (candidates.length >= MAX_TRACKED_MARKETS)
      break;
  }

  if (!candidates.length) {
    console.warn(
      `[sxbet-collector] skip write: raw=${rawMarkets.length} inWindow=${filtered.length} mapped=0`,
    );
    return {
      matches: 0,
      bets: 0,
      raw: rawMarkets.length,
      inWindow: filtered.length,
      skippedClear: true,
    };
  }

  const matches = [...new Map(
    candidates.map(row => [String(row.match.SourceMatchID), row.match]),
  ).values()];
  const keepIds = matches.map(m => String(m.SourceMatchID));

  await writePlatformMatchesAsync(PLATFORM, matches);

  const betsByMatch = new Map();
  for (const mapped of candidates) {
    const sid = String(mapped.match.SourceMatchID);
    if (!betsByMatch.has(sid))
      betsByMatch.set(sid, []);
    betsByMatch.get(sid).push(formatBetOdds(mapped.bet));
  }
  for (const [sid, bets] of betsByMatch)
    await replacePlatformBetsForMatchAsync(PLATFORM, sid, bets);
  await deleteOrphanPlatformBetsAsync(PLATFORM, keepIds);

  let pastPruned = 0;
  try {
    const { pruneMatchesOlderThanCollectPast } = await import("@changmen/db");
    const past = await pruneMatchesOlderThanCollectPast();
    pastPruned = Number(past?.platform?.deleted) || 0;
    if (pastPruned || past?.client?.ended) {
      console.log(
        `[sxbet-collector] past prune platform=${pastPruned} clientEnded=${past?.client?.ended || 0}`,
      );
    }
  }
  catch (err) {
    console.warn("[sxbet-collector] past prune failed:", err?.message || err);
  }

  persistSxBetMarketIndex(candidates);

  return {
    matches: matches.length,
    bets: candidates.length,
    raw: rawMarkets.length,
    inWindow: filtered.length,
    pastPruned,
  };
}
