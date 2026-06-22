import { PLATFORMS } from "@/shared/platform";
import { directGet } from "@/shared/http";
import { wait } from "@/shared/wait";
import { notifyCollectError } from "@platform/shared/collectNotify";
import { useCollectStore } from "@/stores/collectStore";
import {
  DEX_LINE_API,
  DEX_CID,
  dexSportSlugs,
  parseTopEvents,
  dexEventToMatch,
  parseInlineMarkets,
  parseMapFromMarketName,
} from "./parse";
import { startDexSocket, stopDexSocket, onDexBatch } from "./socket";
import type { DexBatchItem } from "./socket";
import type { CollectBetDto } from "@/types/collect";

const LOOP_MS = 30_000;

export function startDexCollector(): () => void {
  let stopped = false;

  const collect = useCollectStore();

  const handleBatch = (items: DexBatchItem[]) => {
    if (!collect.ready || !collect.collect.get(PLATFORMS.Dex)) return;

    const betsToSave: Array<{ matchId: string; bets: CollectBetDto[] }> = [];

    for (const item of items) {
      if (item.model !== "market") continue;
      const mkt = item.data;
      const outcomes = (mkt.outcomes ?? []) as Array<Record<string, unknown>>;
      if (outcomes.length !== 2) continue;

      const eventLid = String(mkt.pid ?? "");
      const eventId = eventLid.split(".").pop() || eventLid;
      if (!eventId) continue;

      const name = String(mkt.name ?? mkt.identity ?? "");
      const map = parseMapFromMarketName(name);
      const home = outcomes[0]!;
      const away = outcomes[1]!;
      const homeFrozen = Boolean(home.isFrozen);
      const awayFrozen = Boolean(away.isFrozen);

      betsToSave.push({
        matchId: eventId,
        bets: [{
          Type: PLATFORMS.Dex,
          SourceMatchID: eventId,
          Map: map,
          SourceBetID: String(mkt.id ?? ""),
          BetName: name,
          SourceHomeID: String(home.id ?? ""),
          HomeName: String(home.name ?? ""),
          HomeOdds: !homeFrozen ? Number(home.price ?? 0) : 0,
          SourceAwayID: String(away.id ?? ""),
          AwayName: String(away.name ?? ""),
          AwayOdds: !awayFrozen ? Number(away.price ?? 0) : 0,
          Status: homeFrozen && awayFrozen ? "Locked" : "Normal",
        }],
      });
    }

    for (const { matchId, bets } of betsToSave) {
      if (bets.length) void collect.saveBets(PLATFORMS.Dex, matchId, bets);
    }
  };

  const runCycle = async () => {
    while (!collect.ready) {
      if (stopped) return;
      await wait(500);
    }

    const matches = [];
    const betsToSave: Array<{ matchId: string; bets: CollectBetDto[] }> = [];

    for (const slug of dexSportSlugs()) {
      try {
        const url = `${DEX_LINE_API}/top-events/${slug}?cid=${DEX_CID}&locale=zh`;
        const rawData = await directGet<{ data?: unknown[] }>(url, {});
        const list = Array.isArray(rawData) ? rawData : rawData?.data;
        const events = parseTopEvents(slug, list);

        for (const ev of events) {
          matches.push(dexEventToMatch(ev));
        }

        if (Array.isArray(list)) {
          for (const item of list) {
            const raw = item as Record<string, unknown>;
            const eventId = String(raw.id ?? "");
            const markets = (raw.markets ?? []) as unknown[];
            if (eventId && markets.length) {
              const bets = parseInlineMarkets(eventId, markets);
              if (bets.length) betsToSave.push({ matchId: eventId, bets });
            }
          }
        }
      } catch (err) {
        console.warn(`[Dex] ${slug} failed`, err);
      }
    }

    if (matches.length) {
      await collect.saveMatch(PLATFORMS.Dex, matches);
      for (const { matchId, bets } of betsToSave) {
        if (bets.length) await collect.saveBets(PLATFORMS.Dex, matchId, bets);
      }
    }
  };

  const unsubBatch = onDexBatch(handleBatch);
  void startDexSocket();

  const loop = async () => {
    while (!stopped) {
      try {
        await runCycle();
      } catch (err) {
        console.warn("[Dex] collect error", err);
        notifyCollectError("Dex", err);
      }
      await wait(LOOP_MS);
    }
  };

  void loop();

  return () => {
    stopped = true;
    unsubBatch();
    stopDexSocket();
  };
}
