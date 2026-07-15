import { saveVenueOdds, getVenueOddsEntry } from "@changmen/client-core/bridge/oddsAccess";
import type { CollectBetDto } from "@changmen/client-core/types/collect";
import { PLATFORMS } from "../shared/platforms";
import { wait } from "@changmen/client-core/shared/wait";
import { notifyCollectError } from "../shared/collectNotify";
import { useCollectStore } from "../shared/webBridge";
import { useMatchStore } from "../shared/webBridge";

import {
  fetchBatchBuyPrices,
  fetchPolymarketEsportsMarkets,
  polymarketCollectStartTimeAllowed,
} from "./api";
import {
  buildPolymarketMappedMarket,
  decimalOddsFromProbability,
  parseJsonArray,
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
const DISCOVERY_MS = 60_000;
const SAVE_BETS_INTERVAL_MS = 5 * 60_000;
const MAX_TRACKED_MARKETS = 400;
const COLLECT_MARKET_TYPES = new Set(["moneyline", "child_moneyline"]);
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
 * 电竞采集消费者：向 marketQuoteHub 登记 discovery asset，收到行情后写 fo。
 * 停采集只 unregister(esport)，不卸体育会话、不停仍有其它消费者的 hub。
 */
export function startPolymarketCollector(): () => void {
  let lastSaveBetsAt = 0;

  const collect = useCollectStore();
  const matchStore = useMatchStore();
  const marketsById = new Map<string, PolymarketMappedMarket>();
  const assetToMarket = new Map<string, string>();
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

  // 登记监听；有 discovery asset 后才 ensure WS（空数组不会建连）
  syncEsportAssets();

  const runDiscovery = async () => {
    while (!collect.ready) {
      if (stopped)
        return;
      await wait(500);
    }

    const rawMarkets = await fetchPolymarketEsportsMarkets();

    const filtered: typeof rawMarkets = [];
    for (const raw of rawMarkets) {
      if (!COLLECT_MARKET_TYPES.has(raw.sportsMarketType ?? ""))
        continue;
      const assetIds = parseJsonArray(raw.clob_token_ids ?? raw.clobTokenIds);
      if (assetIds.length !== 2)
        continue;
      const initial = buildPolymarketMappedMarket(raw);
      if (!initial)
        continue;
      if (!polymarketCollectStartTimeAllowed(initial.match.StartTime))
        continue;
      filtered.push(raw);
    }

    const allAssetIds = filtered.flatMap(raw => parseJsonArray(raw.clob_token_ids ?? raw.clobTokenIds));
    const buyPrices = await fetchBatchBuyPrices(allAssetIds);

    const candidates: PolymarketMappedMarket[] = [];
    for (const raw of filtered) {
      const mapped = buildPolymarketMappedMarket(raw, buyPrices);
      if (mapped)
        candidates.push(mapped);
      if (candidates.length >= MAX_TRACKED_MARKETS)
        break;
    }

    if (!candidates.length) {
      // 无候选：卸掉历史电竞 maps，避免幽灵 asset 继续订 WS / 刷 fo
      marketsById.clear();
      assetToMarket.clear();
      // 对标旧 collector：每轮 discovery 末都重发订阅（修半开/丢订，不等 WS 重连）
      syncEsportAssets(true);
      return;
    }

    const matches = [...new Map(candidates.map(row => [String(row.match.SourceMatchID), row.match])).values()];
    const saved = await collect.saveMatch(PLATFORM, matches);
    const shouldSaveBets = saved && Date.now() - lastSaveBetsAt >= SAVE_BETS_INTERVAL_MS;

    // 每轮按本轮 candidates 重建（勿累计历史，否则已离开 discovery 的盘仍写 fo）
    marketsById.clear();
    assetToMarket.clear();

    const betsByMatch = new Map<string, CollectBetDto[]>();
    for (const mapped of candidates) {
      marketsById.set(mapped.marketId, mapped);
      assetToMarket.set(mapped.assetIds[0], mapped.marketId);
      assetToMarket.set(mapped.assetIds[1], mapped.marketId);
      saveBetOddsToFo(mapped.bet, "http", {
        home: Number(buyPrices[mapped.assetIds[0]!]),
        away: Number(buyPrices[mapped.assetIds[1]!]),
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
    syncEsportAssets(true);
  };

  const loop = async () => {
    while (!stopped) {
      try {
        await runDiscovery();
      }
      catch (err) {
        console.warn("[Polymarket] collect error", err);
        notifyCollectError("Polymarket", err);
      }
      await wait(DISCOVERY_MS);
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
