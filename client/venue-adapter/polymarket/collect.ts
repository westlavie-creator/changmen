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
  polymarketMarketSubscribeMessage,
  type PolymarketWsMessage,
} from "./api";
import { startPolymarketMarketWs } from "./ws";
import {
  bestAskFromBook,
  buildPolymarketMappedMarket,
  decimalOddsFromProbability,
  parseJsonArray,
  type PolymarketMappedMarket,
} from "./parse";
import { isValidClobPrice } from "./pmDetection";

const PLATFORM = PLATFORMS.Polymarket;
const DISCOVERY_MS = 60_000;
const SAVE_BETS_INTERVAL_MS = 5 * 60_000;
const MAX_TRACKED_MARKETS = 400;
const COLLECT_MARKET_TYPES = new Set(["moneyline", "child_moneyline"]);

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


export function extractPolymarketWsBestAsks(raw: string): Array<{ assetId: string; bestAsk: string | number }> {
  if (raw === "PONG") return [];
  const parsed = JSON.parse(raw) as PolymarketWsMessage | PolymarketWsMessage[];
  const messages = Array.isArray(parsed) ? parsed : [parsed];
  const updates: Array<{ assetId: string; bestAsk: string | number }> = [];
  for (const msg of messages) {
    if (msg.event_type === "best_bid_ask" && msg.asset_id && msg.best_ask !== undefined) {
      updates.push({ assetId: String(msg.asset_id), bestAsk: msg.best_ask });
    } else if (msg.event_type === "price_change" && Array.isArray(msg.price_changes)) {
      for (const change of msg.price_changes) {
        if (change.asset_id && change.best_ask !== undefined) {
          updates.push({ assetId: String(change.asset_id), bestAsk: change.best_ask });
        }
      }
    } else if (msg.event_type === "book" && msg.asset_id) {
      const bestAsk = bestAskFromBook({ asks: msg.asks });
      if (bestAsk > 0) updates.push({ assetId: String(msg.asset_id), bestAsk });
    }
  }
  return updates;
}

export function startPolymarketCollector(): () => void {
  let lastSaveBetsAt = 0;

  const collect = useCollectStore();
  const matchStore = useMatchStore();
  const marketsById = new Map<string, PolymarketMappedMarket>();
  const assetToMarket = new Map<string, string>();

  function trackedAssetIds(): string[] {
    const ids: string[] = [];
    for (const market of marketsById.values()) ids.push(...market.assetIds);
    return [...new Set(ids)];
  }

  function subscribeTrackedAssets(initialDump = false) {
    const assetIds = trackedAssetIds();
    if (assetIds.length) wsHandle.send(polymarketMarketSubscribeMessage(assetIds, initialDump));
  }

  function updateBetFromAsset(assetId: string, bestAsk: string | number | undefined) {
    const marketId = assetToMarket.get(assetId);
    if (!marketId) return;
    const mapped = marketsById.get(marketId);
    if (!mapped) return;

    const price = Number(bestAsk);
    if (!Number.isFinite(price) || price <= 0) return;

    const next: CollectBetDto = { ...mapped.bet };
    const decimalOdds = decimalOddsFromProbability(price);
    if (assetId === String(next.SourceHomeID)) next.HomeOdds = decimalOdds;
    if (assetId === String(next.SourceAwayID)) next.AwayOdds = decimalOdds;
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

  function handleWsMessage(raw: string) {
    for (const update of extractPolymarketWsBestAsks(raw)) {
      updateBetFromAsset(update.assetId, update.bestAsk);
    }
  }

  const wsHandle = startPolymarketMarketWs({
    onOpen: () => subscribeTrackedAssets(true),  // 连接/重连：需要 book 快照同步当前状态
    onMessage: handleWsMessage,
  });

  const runDiscovery = async () => {
    while (!collect.ready) {
      if (stopped) return;
      await wait(500);
    }

    const rawMarkets = await fetchPolymarketEsportsMarkets();

    // 第一阶段：过滤，不调用价格接口
    const filtered: typeof rawMarkets = [];
    for (const raw of rawMarkets) {
      if (!COLLECT_MARKET_TYPES.has(raw.sportsMarketType ?? "")) continue;
      const assetIds = parseJsonArray(raw.clob_token_ids ?? raw.clobTokenIds);
      if (assetIds.length !== 2) continue;
      const initial = buildPolymarketMappedMarket(raw);
      if (!initial) continue;
      if (!polymarketCollectStartTimeAllowed(initial.match.StartTime)) continue;
      filtered.push(raw);
    }

    // 第二阶段：一次批量获取所有 token 的 BUY 价格（单次 CLOB /prices 请求）
    const allAssetIds = filtered.flatMap(raw => parseJsonArray(raw.clob_token_ids ?? raw.clobTokenIds));
    const buyPrices = await fetchBatchBuyPrices(allAssetIds);

    // 第三阶段：用批量价格构建候选市场
    const candidates: PolymarketMappedMarket[] = [];
    for (const raw of filtered) {
      const mapped = buildPolymarketMappedMarket(raw, buyPrices);
      if (mapped) candidates.push(mapped);
      if (candidates.length >= MAX_TRACKED_MARKETS) break;
    }

    if (!candidates.length) return;

    const matches = [...new Map(candidates.map(row => [String(row.match.SourceMatchID), row.match])).values()];
    const saved = await collect.saveMatch(PLATFORM, matches);
    const shouldSaveBets = saved && Date.now() - lastSaveBetsAt >= SAVE_BETS_INTERVAL_MS;

    // 按 sourceMatchId 分组 — replacePlatformBetsForMatch 是整场替换，
    // 必须一次性提交该场所有盘口，否则后调用的 saveBets 会删掉先提交的 map
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
        if (!betsByMatch.has(sid)) betsByMatch.set(sid, []);
        betsByMatch.get(sid)!.push(mapped.bet);
      }
    }
    if (shouldSaveBets) {
      for (const [sid, bets] of betsByMatch)
        await collect.saveBets(PLATFORM, sid, bets);
      lastSaveBetsAt = Date.now();
    }
    matchStore.refreshOddsOnBets();
    subscribeTrackedAssets();
  };

  let stopped = false;
  const loop = async () => {
    while (!stopped) {
      try {
        await runDiscovery();
      } catch (err) {
        console.warn("[Polymarket] collect error", err);
        notifyCollectError("Polymarket", err);
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
