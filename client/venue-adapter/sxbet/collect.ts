import { saveVenueOdds } from "@changmen/client-core/bridge/oddsAccess";
import type { CollectBetDto } from "@changmen/client-core/types/collect";
import { PLATFORMS } from "../shared/platforms";
import { wait } from "@changmen/client-core/shared/wait";
import { notifyCollectError } from "../shared/collectNotify";
import { useCollectStore } from "../shared/webBridge";
import { useMatchStore } from "../shared/webBridge";

import {
  SXBET_ESPORTS_SPORT_ID,
  SXBET_USDC,
  fetchSxActiveEsportsMoneylineMarkets,
  fetchSxBestOdds,
  sxbetCollectStartTimeAllowed,
  type SxBestOddsRow,
  type SxBestOddsWsUpdate,
} from "./api";
import {
  applySxBestOddsWsUpdate,
  bestSxDecimalOddsFromBestRow,
  buildSxMappedMarket,
  type SxMappedMarket,
} from "./parse";
import { startSxBetBestOddsWs } from "./ws";

const PLATFORM = PLATFORMS.SXBet;
const DISCOVERY_MS = 60_000;
const SAVE_BETS_INTERVAL_MS = 5 * 60_000;
const MAX_TRACKED_MARKETS = 200;

function saveBetOddsToFo(bet: CollectBetDto, source: "http" | "mqtt") {
  const locked = bet.Status === "Locked";
  const betId = String(bet.SourceBetID);
  const now = Date.now();
  saveVenueOdds(PLATFORM, {
    id: String(bet.SourceHomeID),
    odds: bet.HomeOdds,
    isLock: locked || !bet.HomeOdds,
    betId,
    side: "home",
    time: now,
  }, source);
  saveVenueOdds(PLATFORM, {
    id: String(bet.SourceAwayID),
    odds: bet.AwayOdds,
    isLock: locked || !bet.AwayOdds,
    betId,
    side: "away",
    time: now,
  }, source);
}

function applyBestOddsUpdate(
  marketsByHash: Map<string, SxMappedMarket>,
  bestByHash: Map<string, SxBestOddsRow>,
  update: SxBestOddsWsUpdate,
  matchStore: ReturnType<typeof useMatchStore>,
) {
  if (Number(update.sportId) > 0 && Number(update.sportId) !== SXBET_ESPORTS_SPORT_ID)
    return;
  const hash = String(update.marketHash ?? "").trim();
  if (!hash)
    return;
  const mapped = marketsByHash.get(hash);
  if (!mapped)
    return;

  const prev = bestByHash.get(hash);
  const nextRow = applySxBestOddsWsUpdate(prev, update);
  bestByHash.set(hash, nextRow);

  const homeOdds = bestSxDecimalOddsFromBestRow(nextRow, true);
  const awayOdds = bestSxDecimalOddsFromBestRow(nextRow, false);
  const next: CollectBetDto = {
    ...mapped.bet,
    HomeOdds: homeOdds,
    AwayOdds: awayOdds,
    Status: homeOdds > 0 && awayOdds > 0 ? "Normal" : "Locked",
  };
  mapped.bet = next;
  saveBetOddsToFo(next, "mqtt");
  matchStore.refreshOddsOnBets();
}

export function startSxBetCollector(): () => void {
  let lastSaveBetsAt = 0;
  const collect = useCollectStore();
  const matchStore = useMatchStore();
  const marketsByHash = new Map<string, SxMappedMarket>();
  const bestByHash = new Map<string, SxBestOddsRow>();

  const wsHandle = startSxBetBestOddsWs({
    onUpdate: (update) => {
      applyBestOddsUpdate(marketsByHash, bestByHash, update, matchStore);
    },
  });

  const runDiscovery = async () => {
    while (!collect.ready) {
      if (stopped)
        return;
      await wait(500);
    }

    const rawMarkets = await fetchSxActiveEsportsMoneylineMarkets();
    const filtered = rawMarkets.filter((market) => {
      const startMs = Number(market.gameTime) > 0 ? Number(market.gameTime) * 1000 : 0;
      return sxbetCollectStartTimeAllowed(startMs);
    });
    if (!filtered.length)
      return;

    const hashes = filtered
      .map(row => String(row.marketHash ?? ""))
      .filter(Boolean)
      .slice(0, MAX_TRACKED_MARKETS);
    const bestOdds = await fetchSxBestOdds(hashes, SXBET_USDC);

    const candidates: SxMappedMarket[] = [];
    for (const market of filtered) {
      const hash = String(market.marketHash ?? "");
      const row = bestOdds[hash];
      if (row)
        bestByHash.set(hash, row);
      const mapped = buildSxMappedMarket(market, [], row);
      if (mapped)
        candidates.push(mapped);
      if (candidates.length >= MAX_TRACKED_MARKETS)
        break;
    }
    if (!candidates.length)
      return;

    const matches = [...new Map(
      candidates.map(row => [String(row.match.SourceMatchID), row.match]),
    ).values()];
    const saved = await collect.saveMatch(PLATFORM, matches);
    const shouldSaveBets = saved && Date.now() - lastSaveBetsAt >= SAVE_BETS_INTERVAL_MS;

    const betsByMatch = new Map<string, CollectBetDto[]>();
    const keepHashes = new Set<string>();
    for (const mapped of candidates) {
      keepHashes.add(mapped.marketHash);
      marketsByHash.set(mapped.marketHash, mapped);
      saveBetOddsToFo(mapped.bet, "http");
      if (shouldSaveBets) {
        const sid = String(mapped.match.SourceMatchID);
        if (!betsByMatch.has(sid))
          betsByMatch.set(sid, []);
        betsByMatch.get(sid)!.push(mapped.bet);
      }
    }
    for (const hash of [...marketsByHash.keys()]) {
      if (!keepHashes.has(hash))
        marketsByHash.delete(hash);
    }
    for (const hash of [...bestByHash.keys()]) {
      if (!keepHashes.has(hash))
        bestByHash.delete(hash);
    }
    if (shouldSaveBets) {
      for (const [sid, bets] of betsByMatch)
        await collect.saveBets(PLATFORM, sid, bets);
      lastSaveBetsAt = Date.now();
    }
    matchStore.refreshOddsOnBets();
    void wsHandle.ensureConnected();
  };

  let stopped = false;
  const loop = async () => {
    while (!stopped) {
      try {
        await runDiscovery();
      }
      catch (err) {
        console.warn("[SXBet] collect error", err);
        notifyCollectError("SXBet", err);
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
