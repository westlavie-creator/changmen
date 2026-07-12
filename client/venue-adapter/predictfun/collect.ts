import { getCollectPlatform } from "@changmen/client-core/bridge/clientApi";
import { saveVenueOdds, getVenueOddsEntry } from "@changmen/client-core/bridge/oddsAccess";
import type { CollectBetDto } from "@changmen/client-core/types/collect";
import { PLATFORMS } from "@venue/shared/platforms";
import { wait } from "@changmen/client-core/shared/wait";
import { notifyCollectError } from "@venue/shared/collectNotify";
import { useMatchStore } from "@venue/shared/webBridge";

import {
  applyPredictFunMarketIndex,
  isPredictFunMarketIndex,
} from "./marketIndex";
import {
  bestAskFromPredictBook,
  decimalOddsFromProbability,
  type PredictMappedMarket,
} from "./parse";
import { startPredictMarketWs } from "./ws";

const PLATFORM = PLATFORMS.PredictFun;
const INDEX_SYNC_MS = 30_000;

export function saveTokenQuote(
  params: {
    tokenId: string;
    marketId: string;
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
    marketId: params.marketId,
    isLock: params.locked,
    betId: params.betId,
    side: params.side,
    time: Date.now(),
  }, source);
}

function saveBetOddsToFo(
  bet: CollectBetDto,
  source: "http" | "mqtt",
  marketIds: { home: string; away: string },
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
      marketId: marketIds.home,
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
      marketId: marketIds.home,
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
      marketId: marketIds.away,
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
      marketId: marketIds.away,
      ...(prev?.clobPrice != null ? { clobPrice: prev.clobPrice } : {}),
      isLock: locked || !bet.AwayOdds,
      betId,
      side: "away",
      time: Date.now(),
    }, source);
  }
}

/** [changmen 扩展] VPS HTTP 采集 + 浏览器仅 WS → fo（不经 http-relay 打 discovery） */
export function startPredictFunCollector(): () => void {
  const matchStore = useMatchStore();
  const marketsByCategory = new Map<string, PredictMappedMarket>();
  const marketIdToCategory = new Map<string, string>();
  let lastIndexUpdatedAt = 0;

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
      marketId,
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

  async function syncMarketIndex() {
    const platform = await getCollectPlatform(PLATFORM);
    const index = isPredictFunMarketIndex(platform?.MarketIndex) ? platform.MarketIndex : null;
    if (!index?.entries?.length) {
      if (lastIndexUpdatedAt !== 0) {
        marketsByCategory.clear();
        marketIdToCategory.clear();
        wsHandle.subscribeMarketIds([]);
        lastIndexUpdatedAt = 0;
      }
      return;
    }
    if (index.updatedAt === lastIndexUpdatedAt)
      return;
    lastIndexUpdatedAt = index.updatedAt;

    const marketIds = applyPredictFunMarketIndex(index, {
      marketsByCategory,
      marketIdToCategory,
    });
    for (const mapped of marketsByCategory.values()) {
      saveBetOddsToFo(mapped.bet, "http", {
        home: mapped.homeMarketId,
        away: mapped.awayMarketId,
      });
    }
    matchStore.refreshOddsOnBets();
    wsHandle.subscribeMarketIds(marketIds.length ? marketIds : trackedMarketIds());
  }

  let stopped = false;
  const loop = async () => {
    while (!stopped) {
      try {
        await syncMarketIndex();
      }
      catch (err) {
        console.warn("[PredictFun] index sync error", err);
        notifyCollectError("PredictFun", err);
      }
      await wait(INDEX_SYNC_MS);
    }
  };

  void loop();

  return () => {
    stopped = true;
    wsHandle.stop();
  };
}
