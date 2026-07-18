/**
 * Polymarket 电竞：VPS 写 platform_* + MarketIndex；浏览器只同步 Index → Market WS → fo。
 * 不再跑 Gamma / SaveMatch / SaveBets。
 */
import { getCollectPlatform } from "@changmen/client-core/bridge/clientApi";
import { saveVenueOdds, getVenueOddsEntry } from "@changmen/client-core/bridge/oddsAccess";
import type { CollectBetDto } from "@changmen/client-core/types/collect";
import { PLATFORMS } from "../shared/platforms";
import { wait } from "@changmen/client-core/shared/wait";
import { notifyCollectError } from "../shared/collectNotify";
import { useCollectStore } from "../shared/webBridge";
import { useMatchStore } from "../shared/webBridge";

import {
  applyPolymarketMarketIndex,
  isPolymarketMarketIndex,
} from "./marketIndex";
import { replacePmMapOutcomesFromIndex } from "./pmMapOutcomeStore";
import {
  decimalOddsFromProbability,
  type PolymarketMappedMarket,
} from "./parse";
import { isValidClobPrice } from "./pmDetection";
import {
  onPolymarketMarketHubReady,
  onPolymarketMarketQuote,
  registerPolymarketQuoteAssets,
  unregisterPolymarketQuoteConsumer,
} from "./marketQuoteHub";

const PLATFORM = PLATFORMS.Polymarket;
const INDEX_SYNC_MS = 30_000;
const QUOTE_CONSUMER = "esport" as const;

/** PM 写 fo 的唯一入口：decimal odds 供展示/套利，clobPrice 供预检限价 */
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
      ...(prev?.clobPrice != null && isValidClobPrice(prev.clobPrice) ? { clobPrice: prev.clobPrice } : {}),
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
      ...(prev?.clobPrice != null && isValidClobPrice(prev.clobPrice) ? { clobPrice: prev.clobPrice } : {}),
      isLock: locked || !bet.AwayOdds,
      betId,
      side: "away",
      time: Date.now(),
    }, source);
  }
}

/**
 * 电竞行情消费者：同步 VPS MarketIndex，登记 asset，收到行情后写 fo。
 * 停采集只 unregister(esport)，不卸体育会话。
 */
export function startPolymarketCollector(): () => void {
  const collect = useCollectStore();
  const matchStore = useMatchStore();
  const marketsById = new Map<string, PolymarketMappedMarket>();
  const assetToMarket = new Map<string, string>();
  let lastIndexUpdatedAt = 0;
  let stopped = false;

  function esportAssetIds(): string[] {
    const ids: string[] = [];
    for (const market of marketsById.values())
      ids.push(...market.assetIds);
    return ids;
  }

  function syncEsportAssets(force = false) {
    if (stopped)
      return;
    registerPolymarketQuoteAssets(QUOTE_CONSUMER, esportAssetIds(), force);
  }

  function updateBetFromAsset(assetId: string, bestAsk: string | number | undefined) {
    const marketId = assetToMarket.get(assetId);
    if (!marketId)
      return;
    const mapped = marketsById.get(marketId);
    if (!mapped)
      return;

    const price = Number(bestAsk);
    if (!Number.isFinite(price) || price <= 0)
      return;

    const next: CollectBetDto = { ...mapped.bet };
    const decimalOdds = decimalOddsFromProbability(price);
    if (assetId === String(next.SourceHomeID))
      next.HomeOdds = decimalOdds;
    if (assetId === String(next.SourceAwayID))
      next.AwayOdds = decimalOdds;
    next.Status = next.HomeOdds > 0 && next.AwayOdds > 0 ? "Normal" : "Locked";
    mapped.bet = next;
    const betId = String(next.SourceBetID);
    const side = assetId === String(next.SourceHomeID) ? "home" as const : "away" as const;
    saveTokenQuote({
      tokenId: assetId,
      clobPrice: price,
      betId,
      side,
      locked: next.Status === "Locked" || (side === "home" ? !next.HomeOdds : !next.AwayOdds),
    }, "mqtt");
    matchStore.refreshOddsOnBets();
  }

  const unQuote = onPolymarketMarketQuote((q) => {
    if (stopped)
      return;
    updateBetFromAsset(q.assetId, q.bestAsk);
  });

  const unReady = onPolymarketMarketHubReady(() => {
    syncEsportAssets(true);
  });

  syncEsportAssets();

  async function syncMarketIndex() {
    while (!collect.ready) {
      if (stopped)
        return;
      await wait(500);
    }

    const platform = await getCollectPlatform(PLATFORM);
    const index = isPolymarketMarketIndex(platform?.MarketIndex) ? platform.MarketIndex : null;
    if (!index?.entries?.length) {
      // 空 Index：卸掉电竞 maps，避免幽灵 asset；勿在从未成功过时反复 clear
      if (lastIndexUpdatedAt !== 0) {
        marketsById.clear();
        assetToMarket.clear();
        replacePmMapOutcomesFromIndex(null);
        lastIndexUpdatedAt = 0;
      }
      syncEsportAssets();
      return;
    }
    if (index.updatedAt === lastIndexUpdatedAt) {
      syncEsportAssets(true);
      return;
    }
    lastIndexUpdatedAt = index.updatedAt;

    applyPolymarketMarketIndex(index, { marketsById, assetToMarket });
    replacePmMapOutcomesFromIndex(index);
    for (const entry of index.entries) {
      const mapped = marketsById.get(String(entry.marketId));
      if (!mapped)
        continue;
      saveBetOddsToFo(mapped.bet, "http", {
        home: entry.homeClobPrice,
        away: entry.awayClobPrice,
      });
    }
    matchStore.refreshOddsOnBets();
    syncEsportAssets(true);
  }

  const loop = async () => {
    while (!stopped) {
      try {
        await syncMarketIndex();
      }
      catch (err) {
        console.warn("[Polymarket] index sync error", err);
        notifyCollectError("Polymarket", err);
      }
      await wait(INDEX_SYNC_MS);
    }
  };

  void loop();

  return () => {
    stopped = true;
    unQuote();
    unReady();
    unregisterPolymarketQuoteConsumer(QUOTE_CONSUMER);
  };
}
