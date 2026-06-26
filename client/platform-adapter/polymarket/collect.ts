import type { CollectBetDto } from "@/types/collect";
import { hasA8PluginRuntime } from "@/chrome-plugin/bridge";
import { PLATFORMS } from "@/shared/platform";
import { wait } from "@/shared/wait";
import { a8StartTimeCollectAllowed } from "@/shared/a8MatchTime";
import { notifyCollectError } from "@platform/shared/collectNotify";
import { saveLiveTimer } from "@/api/esport";
import { useCollectStore } from "@/stores/collectStore";
import { useMatchStore } from "@/stores/matchStore";
import { useOddsStore } from "@/stores/oddsStore";
import {
  POLYMARKET_MARKET_WS,
  POLYMARKET_SPORTS_WS,
  fetchBatchBuyPrices,
  fetchPolymarketEsportsMarkets,
  polymarketMarketSubscribeMessage,
  type PolymarketSportResult,
  type PolymarketWsMessage,
} from "./api";
import {
  buildPolymarketMappedMarket,
  decimalOddsFromProbability,
  parseJsonArray,
  parsePeriodToRound,
  type PolymarketMappedMarket,
} from "./parse";
import { POLYMARKET_PLUGIN_REQUIRED_MSG } from "./transport";

const PLATFORM = PLATFORMS.Polymarket;
const DISCOVERY_MS = 60_000;
const WS_RECONNECT_MS = 5_000;
const WS_PING_MS = 10_000;
const SAVE_BETS_INTERVAL_MS = 5 * 60_000;
const MAX_TRACKED_MARKETS = 400;
const COLLECT_MARKET_TYPES = new Set(["moneyline", "child_moneyline"]);

export type PolymarketWsStatus = "disconnected" | "connecting" | "connected" | "error";
type PolymarketWsStatusListener = (status: PolymarketWsStatus) => void;

let polymarketWsStatus: PolymarketWsStatus = "disconnected";
const polymarketWsStatusListeners = new Set<PolymarketWsStatusListener>();

function setPolymarketWsStatus(status: PolymarketWsStatus) {
  polymarketWsStatus = status;
  for (const fn of polymarketWsStatusListeners) fn(status);
}

export function getPolymarketWsStatus(): PolymarketWsStatus {
  return polymarketWsStatus;
}

export function onPolymarketWsStatus(fn: PolymarketWsStatusListener): () => void {
  polymarketWsStatusListeners.add(fn);
  return () => polymarketWsStatusListeners.delete(fn);
}

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
  let sportsWs: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let sportsReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let lastSaveBetsAt = 0;

  const collect = useCollectStore();
  const matchStore = useMatchStore();
  const odds = useOddsStore();
  const marketsById = new Map<string, PolymarketMappedMarket>();
  const assetToMarket = new Map<string, string>();
  const pendingSave = new Map<string, CollectBetDto>();
  /** Sports WS: pandascore gameId → Polymarket sourceMatchId */
  const gameIdToMatchId = new Map<number, string>();
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
    // 按 matchId 分组后再提交，避免 replacePlatformBetsForMatch 逐条覆盖
    const byMatch = new Map<string, CollectBetDto[]>();
    for (const bet of rows) {
      const sid = String(bet.SourceMatchID);
      if (!byMatch.has(sid)) byMatch.set(sid, []);
      byMatch.get(sid)!.push(bet);
    }
    for (const [sid, bets] of byMatch)
      await collect.saveBets(PLATFORM, sid, bets);
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

  // ── Sports WebSocket：实时比赛状态（period/score），补充 OB live_timers ──────
  function handleSportsMessage(raw: string) {
    if (raw === "ping") {
      sportsWs?.send("pong");
      return;
    }
    let data: PolymarketSportResult;
    try {
      data = JSON.parse(raw) as PolymarketSportResult;
    }
    catch {
      return;
    }
    if (!data.gameId) return;
    const sourceMatchId = gameIdToMatchId.get(data.gameId);
    if (!sourceMatchId) return;
    const round = parsePeriodToRound(data.period);
    if (round === null) return;
    void saveLiveTimer(PLATFORM, [{ MatchID: sourceMatchId, Round: round, StartTime: Date.now() }]);
  }

  function connectSportsWs() {
    if (stopped || sportsWs) return;
    sportsWs = new WebSocket(POLYMARKET_SPORTS_WS);
    sportsWs.onmessage = (event) => {
      try {
        handleSportsMessage(String(event.data));
      }
      catch (err) {
        console.warn("[Polymarket Sports WS] parse error", err);
      }
    };
    sportsWs.onclose = () => {
      sportsWs = null;
      if (!stopped) {
        sportsReconnectTimer = setTimeout(() => {
          sportsReconnectTimer = null;
          connectSportsWs();
        }, WS_RECONNECT_MS);
      }
    };
    sportsWs.onerror = () => {
      sportsWs?.close();
    };
  }

  function connectWs() {
    if (stopped || ws) return;
    setPolymarketWsStatus("connecting");
    ws = new WebSocket(POLYMARKET_MARKET_WS);
    ws.onopen = () => {
      setPolymarketWsStatus("connected");
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
      setPolymarketWsStatus(stopped ? "disconnected" : "error");
      scheduleReconnect();
    };
    ws.onerror = () => {
      setPolymarketWsStatus("error");
      ws?.close();
    };
  }

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

    // 维护 Sports WS gameId → sourceMatchId 映射
    for (const mapped of candidates) {
      if (mapped.gameId)
        gameIdToMatchId.set(mapped.gameId, String(mapped.match.SourceMatchID));
    }

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
        pendingSave.delete(mapped.marketId);
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

  const loop = async () => {
    connectWs();
    connectSportsWs();
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
    if (sportsReconnectTimer) clearTimeout(sportsReconnectTimer);
    if (pingTimer) clearInterval(pingTimer);
    ws?.close();
    sportsWs?.close();
    cleanupWs();
    setPolymarketWsStatus("disconnected");
  };
}
