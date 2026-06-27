import type { CollectBetDto } from "@/types/collect";
import { hasA8PluginRuntime } from "@/chrome-plugin/bridge";
import { PLATFORMS } from "@/shared/platform";
import { wait } from "@/shared/wait";
import { a8StartTimeCollectAllowed } from "@/shared/a8MatchTime";
import { notifyCollectError } from "@venue/shared/collectNotify";
import { useCollectStore } from "@/stores/collectStore";
import { useMatchStore } from "@/stores/matchStore";
import { useOddsStore } from "@/stores/oddsStore";
import {
  fetchBatchBuyPrices,
  fetchPolymarketEsportsMarkets,
  polymarketMarketSubscribeMessage,
  type PolymarketWsMessage,
} from "./api";
import { startPolymarketMarketWs } from "./ws";
import {
  buildPolymarketMappedMarket,
  decimalOddsFromProbability,
  parseJsonArray,
  type PolymarketMappedMarket,
} from "./parse";
import { POLYMARKET_PLUGIN_REQUIRED_MSG } from "./transport";

const PLATFORM = PLATFORMS.Polymarket;
const DISCOVERY_MS = 60_000;
const SAVE_BETS_INTERVAL_MS = 5 * 60_000;
const MAX_TRACKED_MARKETS = 400;
const COLLECT_MARKET_TYPES = new Set(["moneyline", "child_moneyline"]);

function saveOddsEntry(odds: ReturnType<typeof useOddsStore>, bet: CollectBetDto, source: "http" | "mqtt") {
  const locked = bet.Status === "Locked";
  odds.save(PLATFORM, {
    id: String(bet.SourceHomeID),
    odds: bet.HomeOdds,
    isLock: locked || !bet.HomeOdds,
    betId: String(bet.SourceBetID),
    side: "home",
    time: Date.now(),
  }, source);
  odds.save(PLATFORM, {
    id: String(bet.SourceAwayID),
    odds: bet.AwayOdds,
    isLock: locked || !bet.AwayOdds,
    betId: String(bet.SourceBetID),
    side: "away",
    time: Date.now(),
  }, source);
}


export function extractPolymarketWsBestAsks(raw: string): Array<{ assetId: string; bestAsk: string | number }> {
  if (raw === "PONG") return [];
  const parsed = JSON.parse(raw) as PolymarketWsMessage | PolymarketWsMessage[];
  const messages = Array.isArray(parsed) ? parsed : [parsed];
  const updates: Array<{ assetId: string; bestAsk: string | number }> = [];
  for (const msg of messages) {
    if (
      (msg.event_type === "best_bid_ask" || msg.event_type === "price_change")
      && msg.asset_id
      && msg.best_ask !== undefined
    ) {
      updates.push({ assetId: String(msg.asset_id), bestAsk: msg.best_ask });
    }
  }
  return updates;
}

export function startPolymarketCollector(): () => void {
  let lastSaveBetsAt = 0;

  const collect = useCollectStore();
  const matchStore = useMatchStore();
  const odds = useOddsStore();
  const marketsById = new Map<string, PolymarketMappedMarket>();
  const assetToMarket = new Map<string, string>();
  let pluginMissingNotified = false;

  function trackedAssetIds(): string[] {
    const ids: string[] = [];
    for (const market of marketsById.values()) ids.push(...market.assetIds);
    return [...new Set(ids)];
  }

  function subscribeTrackedAssets() {
    const assetIds = trackedAssetIds();
    if (assetIds.length) wsHandle.send(polymarketMarketSubscribeMessage(assetIds));
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
    saveOddsEntry(odds, next, "mqtt");
    matchStore.refreshOddsOnBets();
  }

  function handleWsMessage(raw: string) {
    for (const update of extractPolymarketWsBestAsks(raw)) {
      updateBetFromAsset(update.assetId, update.bestAsk);
    }
  }

  const wsHandle = startPolymarketMarketWs({
    onOpen: subscribeTrackedAssets,
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
      if (!a8StartTimeCollectAllowed(initial.match.StartTime)) continue;
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
      saveOddsEntry(odds, mapped.bet, "http");
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
        if (!hasA8PluginRuntime()) {
          if (!pluginMissingNotified) {
            notifyCollectError("Polymarket", POLYMARKET_PLUGIN_REQUIRED_MSG);
            pluginMissingNotified = true;
          }
          await wait(DISCOVERY_MS);
          continue;
        }
        pluginMissingNotified = false;
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
