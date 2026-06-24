import type { CollectBetDto } from "@/types/collect";
import { hasA8PluginRuntime } from "@/chrome-plugin/bridge";
import { PLATFORMS } from "@/shared/platform";
import { wait } from "@/shared/wait";
import { a8StartTimeCollectAllowed } from "@/shared/a8MatchTime";
import { notifyCollectError } from "@platform/shared/collectNotify";
import { useCollectStore } from "@/stores/collectStore";
import { useMatchStore } from "@/stores/matchStore";
import { useOddsStore } from "@/stores/oddsStore";
import {
  POLYMARKET_MARKET_WS,
  fetchPolymarketBook,
  fetchPolymarketEsportsMarkets,
  polymarketMarketSubscribeMessage,
  type PolymarketWsMessage,
} from "./api";
import {
  buildPolymarketMappedMarket,
  decimalOddsFromProbability,
  parseJsonArray,
  type PolymarketMappedMarket,
  type PolymarketBook,
} from "./parse";
import { POLYMARKET_PLUGIN_REQUIRED_MSG } from "./transport";

const PLATFORM = PLATFORMS.Polymarket;
const DISCOVERY_MS = 60_000;
const WS_RECONNECT_MS = 5_000;
const WS_PING_MS = 10_000;
const SAVE_BETS_INTERVAL_MS = 5 * 60_000;
const MAX_TRACKED_MARKETS = 80;

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

async function fetchBooks(assetIds: [string, string]): Promise<Partial<Record<string, PolymarketBook>>> {
  const pairs = await Promise.all(assetIds.map(async (assetId) => {
    try {
      return [assetId, await fetchPolymarketBook(assetId)] as const;
    } catch {
      return [assetId, null] as const;
    }
  }));
  const books: Partial<Record<string, PolymarketBook>> = {};
  for (const [assetId, book] of pairs) {
    if (book) books[assetId] = book;
  }
  return books;
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
    }
  }
  return updates;
}

export function startPolymarketCollector(): () => void {
  let stopped = false;
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let lastSaveBetsAt = 0;

  const collect = useCollectStore();
  const matchStore = useMatchStore();
  const odds = useOddsStore();
  const marketsById = new Map<string, PolymarketMappedMarket>();
  const assetToMarket = new Map<string, string>();
  const pendingSave = new Map<string, CollectBetDto>();
  let pluginMissingNotified = false;

  function trackedAssetIds(): string[] {
    const ids: string[] = [];
    for (const market of marketsById.values()) ids.push(...market.assetIds);
    return [...new Set(ids)];
  }

  function subscribeTrackedAssets() {
    if (ws?.readyState !== WebSocket.OPEN) return;
    const assetIds = trackedAssetIds();
    if (assetIds.length) ws.send(polymarketMarketSubscribeMessage(assetIds));
  }

  async function flushPendingBets() {
    if (!pendingSave.size) return;
    if (Date.now() - lastSaveBetsAt < SAVE_BETS_INTERVAL_MS) return;
    const rows = [...pendingSave.values()];
    pendingSave.clear();
    for (const bet of rows) {
      await collect.saveBets(PLATFORM, bet.SourceMatchID, [bet]);
    }
    lastSaveBetsAt = Date.now();
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
    pendingSave.set(marketId, next);
    matchStore.refreshOddsOnBets();
  }

  function handleWsMessage(raw: string) {
    for (const update of extractPolymarketWsBestAsks(raw)) {
      updateBetFromAsset(update.assetId, update.bestAsk);
    }
    if (Date.now() - lastSaveBetsAt >= SAVE_BETS_INTERVAL_MS) {
      void flushPendingBets();
    }
  }

  function cleanupWs() {
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
    ws = null;
  }

  function scheduleReconnect() {
    if (stopped || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connectWs();
    }, WS_RECONNECT_MS);
  }

  function connectWs() {
    if (stopped || ws) return;
    ws = new WebSocket(POLYMARKET_MARKET_WS);
    ws.onopen = () => {
      subscribeTrackedAssets();
      pingTimer = setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN) ws.send("PING");
      }, WS_PING_MS);
    };
    ws.onmessage = (event) => {
      try {
        handleWsMessage(String(event.data));
      } catch (err) {
        console.warn("[Polymarket WS] parse error", err);
      }
    };
    ws.onclose = () => {
      cleanupWs();
      scheduleReconnect();
    };
    ws.onerror = () => {
      ws?.close();
    };
  }

  const runDiscovery = async () => {
    while (!collect.ready) {
      if (stopped) return;
      await wait(500);
    }

    const rawMarkets = await fetchPolymarketEsportsMarkets();
    const candidates: PolymarketMappedMarket[] = [];
    for (const raw of rawMarkets) {
      const assetIds = parseJsonArray(raw.clob_token_ids ?? raw.clobTokenIds);
      if (assetIds.length !== 2) continue;
      const initial = buildPolymarketMappedMarket(raw);
      if (!initial) continue;
      if (!a8StartTimeCollectAllowed(initial.match.StartTime)) continue;
      const books = await fetchBooks(initial.assetIds);
      const mapped = buildPolymarketMappedMarket(raw, books);
      if (mapped) candidates.push(mapped);
      if (candidates.length >= MAX_TRACKED_MARKETS) break;
    }

    if (!candidates.length) return;
    const matches = [...new Map(candidates.map(row => [String(row.match.SourceMatchID), row.match])).values()];
    const saved = await collect.saveMatch(PLATFORM, matches);
    const shouldSaveBets = saved && Date.now() - lastSaveBetsAt >= SAVE_BETS_INTERVAL_MS;
    for (const mapped of candidates) {
      marketsById.set(mapped.marketId, mapped);
      assetToMarket.set(mapped.assetIds[0], mapped.marketId);
      assetToMarket.set(mapped.assetIds[1], mapped.marketId);
      saveOddsEntry(odds, mapped.bet, "http");
      if (shouldSaveBets) {
        await collect.saveBets(PLATFORM, mapped.match.SourceMatchID, [mapped.bet]);
        pendingSave.delete(mapped.marketId);
      }
    }
    if (shouldSaveBets)
      lastSaveBetsAt = Date.now();
    matchStore.refreshOddsOnBets();
    subscribeTrackedAssets();
  };

  const loop = async () => {
    connectWs();
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
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (pingTimer) clearInterval(pingTimer);
    ws?.close();
    cleanupWs();
  };
}
