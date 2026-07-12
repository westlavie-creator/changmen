import { saveVenueOdds } from "@changmen/client-core/bridge/oddsAccess";
import type { CollectBetDto } from "@changmen/client-core/types/collect";
import { PLATFORMS } from "@changmen/venue-adapter/shared/platforms";
import { wait } from "@changmen/client-core/shared/wait";
import { notifyCollectError } from "@changmen/venue-adapter/shared/collectNotify";
import { useCollectStore } from "@changmen/venue-adapter/shared/webBridge";
import { useMatchStore } from "@changmen/venue-adapter/shared/webBridge";

import {
  fetchSxActiveEsportsMoneylineMarkets,
  fetchSxOrdersForMarkets,
  sxbetCollectStartTimeAllowed,
} from "./api";
import { buildSxMappedMarket, type SxMappedMarket } from "./parse";

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

export function startSxBetCollector(): () => void {
  let lastSaveBetsAt = 0;
  const collect = useCollectStore();
  const matchStore = useMatchStore();
  const marketsByHash = new Map<string, SxMappedMarket>();

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
    const ordersByHash = await fetchSxOrdersForMarkets(hashes);

    const candidates: SxMappedMarket[] = [];
    for (const market of filtered) {
      const hash = String(market.marketHash ?? "");
      const mapped = buildSxMappedMarket(market, ordersByHash[hash] ?? []);
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
    for (const mapped of candidates) {
      marketsByHash.set(mapped.marketHash, mapped);
      saveBetOddsToFo(mapped.bet, "http");
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
  };
}
