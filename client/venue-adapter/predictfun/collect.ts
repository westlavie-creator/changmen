import { saveVenueOdds, getVenueOddsEntry } from "@changmen/client-core/bridge/oddsAccess";
import type { CollectBetDto } from "@changmen/client-core/types/collect";
import { PLATFORMS } from "@venue/shared/platforms";
import { wait } from "@changmen/client-core/shared/wait";
import { notifyCollectError } from "@venue/shared/collectNotify";
import { useCollectStore } from "@venue/shared/webBridge";
import { useMatchStore } from "@venue/shared/webBridge";

import {
  fetchPredictCategories,
  fetchPredictOrderbooks,
  predictCollectStartTimeAllowed,
} from "./api";
import {
  bestAskFromPredictBook,
  buildPredictMappedMarket,
  decimalOddsFromProbability,
  isPredictEsportsMoneylineCategory,
  type PredictMappedMarket,
} from "./parse";
import { startPredictMarketWs } from "./ws";

const PLATFORM = PLATFORMS.PredictFun;
const DISCOVERY_MS = 60_000;
const SAVE_BETS_INTERVAL_MS = 5 * 60_000;
const MAX_TRACKED_MARKETS = 200;

export function saveTokenQuote(
  params: {
    tokenId: string;
    clobPrice: number;
    betId: string;
    side: "home" | "away";
    locked: boolean;
  },
  source: "http" | "mqtt",
) {
  saveVenueOdds(PLATFORM, {
    id: params.tokenId,
    odds: decimalOddsFromProbability(params.clobPrice),
    clobPrice: params.clobPrice,
    isLock: params.locked,
    betId: params.betId,
    side: params.side,
    time: Date.now(),
  }, source);
}

function saveBetOddsToFo(
  bet: CollectBetDto,
  source: "http" | "mqtt",
  clobPrices?: { home?: number; away?: number },
) {
  const locked = bet.Status === "Locked";
  const betId = String(bet.SourceBetID);
  const homeId = String(bet.SourceHomeID);
  const awayId = String(bet.SourceAwayID);
  const homePrice = clobPrices?.home;
  if (Number.isFinite(homePrice) && homePrice! > 0) {
    saveTokenQuote({
      tokenId: homeId,
      clobPrice: homePrice!,
      betId,
      side: "home",
      locked: locked || !bet.HomeOdds,
    }, source);
  }
  else {
    const prev = getVenueOddsEntry(PLATFORM, homeId);
    saveVenueOdds(PLATFORM, {
      id: homeId,
      odds: bet.HomeOdds,
      ...(prev?.clobPrice != null ? { clobPrice: prev.clobPrice } : {}),
      isLock: locked || !bet.HomeOdds,
      betId,
      side: "home",
      time: Date.now(),
    }, source);
  }
  const awayPrice = clobPrices?.away;
  if (Number.isFinite(awayPrice) && awayPrice! > 0) {
    saveTokenQuote({
      tokenId: awayId,
      clobPrice: awayPrice!,
      betId,
      side: "away",
      locked: locked || !bet.AwayOdds,
    }, source);
  }
  else {
    const prev = getVenueOddsEntry(PLATFORM, awayId);
    saveVenueOdds(PLATFORM, {
      id: awayId,
      odds: bet.AwayOdds,
      ...(prev?.clobPrice != null ? { clobPrice: prev.clobPrice } : {}),
      isLock: locked || !bet.AwayOdds,
      betId,
      side: "away",
      time: Date.now(),
    }, source);
  }
}

export function startPredictFunCollector(): () => void {
  let lastSaveBetsAt = 0;
  const collect = useCollectStore();
  const matchStore = useMatchStore();
  const marketsByCategory = new Map<string, PredictMappedMarket>();
  const marketIdToCategory = new Map<string, string>();
  function trackedMarketIds(): string[] {
    const ids: string[] = [];
    for (const mapped of marketsByCategory.values()) {
      ids.push(mapped.homeMarketId, mapped.awayMarketId);
    }
    return [...new Set(ids)];
  }

  function updateBetFromMarketId(marketId: string, bestAsk: number) {
    const categoryId = marketIdToCategory.get(marketId);
    if (!categoryId)
      return;
    const mapped = marketsByCategory.get(categoryId);
    if (!mapped)
      return;
    if (!Number.isFinite(bestAsk) || bestAsk <= 0 || bestAsk >= 1)
      return;

    const next: CollectBetDto = { ...mapped.bet };
    const tokenId = marketId === mapped.homeMarketId
      ? mapped.homeTokenId
      : marketId === mapped.awayMarketId
        ? mapped.awayTokenId
        : "";
    if (!tokenId)
      return;

    const decimalOdds = decimalOddsFromProbability(bestAsk);
    if (tokenId === String(next.SourceHomeID))
      next.HomeOdds = decimalOdds;
    if (tokenId === String(next.SourceAwayID))
      next.AwayOdds = decimalOdds;
    next.Status = next.HomeOdds > 0 && next.AwayOdds > 0 ? "Normal" : "Locked";
    mapped.bet = next;

    const side = tokenId === String(next.SourceHomeID) ? "home" as const : "away" as const;
    saveTokenQuote({
      tokenId,
      clobPrice: bestAsk,
      betId: String(next.SourceBetID),
      side,
      locked: next.Status === "Locked" || (side === "home" ? !next.HomeOdds : !next.AwayOdds),
    }, "mqtt");
    matchStore.refreshOddsOnBets();
  }

  const wsHandle = startPredictMarketWs({
    onOrderbook: (update) => {
      const marketId = String(update.marketId ?? "");
      const ask = bestAskFromPredictBook(update.orderbook);
      if (marketId && ask > 0)
        updateBetFromMarketId(marketId, ask);
    },
  });

  const runDiscovery = async () => {
    while (!collect.ready) {
      if (stopped)
        return;
      await wait(500);
    }

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

    const marketIds: string[] = [];
    for (const category of filtered) {
      for (const market of category.markets ?? []) {
        if (market.id != null)
          marketIds.push(String(market.id));
      }
    }
    const books = await fetchPredictOrderbooks(marketIds);
    const buyPrices: Record<string, number> = {};
    for (const [id, book] of Object.entries(books)) {
      const ask = bestAskFromPredictBook(book);
      if (ask > 0 && ask < 1)
        buyPrices[id] = ask;
    }

    const candidates: PredictMappedMarket[] = [];
    for (const category of filtered) {
      const mapped = buildPredictMappedMarket(category, buyPrices);
      if (mapped)
        candidates.push(mapped);
      if (candidates.length >= MAX_TRACKED_MARKETS)
        break;
    }
    if (!candidates.length)
      return;

    const matches = [...new Map(candidates.map(row => [String(row.match.SourceMatchID), row.match])).values()];
    const saved = await collect.saveMatch(PLATFORM, matches);
    const shouldSaveBets = saved && Date.now() - lastSaveBetsAt >= SAVE_BETS_INTERVAL_MS;

    const betsByMatch = new Map<string, CollectBetDto[]>();
    for (const mapped of candidates) {
      marketsByCategory.set(mapped.categoryId, mapped);
      marketIdToCategory.set(mapped.homeMarketId, mapped.categoryId);
      marketIdToCategory.set(mapped.awayMarketId, mapped.categoryId);
      saveBetOddsToFo(mapped.bet, "http", {
        home: buyPrices[mapped.homeMarketId],
        away: buyPrices[mapped.awayMarketId],
      });
      if (shouldSaveBets) {
        const sid = String(mapped.match.SourceMatchID);
        if (!betsByMatch.has(sid))
          betsByMatch.set(sid, []);
        betsByMatch.get(sid)!.push(mapped.bet);
      }
    }
    if (shouldSaveBets) {
      for (const [sid, bets] of betsByMatch)
        await collect.saveBets(PLATFORM, sid, bets);
      lastSaveBetsAt = Date.now();
    }
    matchStore.refreshOddsOnBets();
    wsHandle.subscribeMarketIds(trackedMarketIds());
  };

  let stopped = false;
  const loop = async () => {
    while (!stopped) {
      try {
        await runDiscovery();
      }
      catch (err) {
        console.warn("[PredictFun] collect error", err);
        notifyCollectError("PredictFun", err);
      }
      await wait(DISCOVERY_MS);
    }
  };

  void loop();

  return () => {
    stopped = true;
    wsHandle.stop();
  };
}
