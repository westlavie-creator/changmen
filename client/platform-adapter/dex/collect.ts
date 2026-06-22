import { PLATFORMS } from "@/shared/platform";
import { directGet } from "@/shared/http";
import { wait } from "@/shared/wait";
import { notifyCollectError } from "@platform/shared/collectNotify";
import { useCollectStore } from "@/stores/collectStore";
import { useMatchStore } from "@/stores/matchStore";
import { useOddsStore } from "@/stores/oddsStore";
import {
  DEX_LINE_API,
  DEX_CID,
  dexSportSlugs,
  parseTopEvents,
  dexEventToMatch,
  parseInlineMarkets,
} from "./parse";
import { startDexSocket, stopDexSocket, onDexBatch, subscribeDexMarkets } from "./socket";
import type { DexBatchItem } from "./socket";
import type { CollectBetDto } from "@/types/collect";

const LOOP_MS = 10_000;

export function startDexCollector(): () => void {
  let stopped = false;

  const collect = useCollectStore();
  const matchStore = useMatchStore();
  const odds = useOddsStore();

  /** WS 推送：只更新内存赔率（oddsStore），不写数据库 */
  const handleBatch = (items: DexBatchItem[]) => {
    let updated = false;

    for (const item of items) {
      if (item.model !== "market") continue;
      const mkt = item.data;
      const outcomes = (mkt.outcomes ?? []) as Array<Record<string, unknown>>;
      if (outcomes.length !== 2) continue;

      const home = outcomes[0]!;
      const away = outcomes[1]!;
      const locked = Boolean(home.isFrozen) && Boolean(away.isFrozen);
      const marketId = String(mkt.id ?? "");

      if (home.id) {
        odds.save(PLATFORMS.Dex, {
          id: String(home.id),
          odds: Number(home.price ?? 0),
          isLock: locked || Boolean(home.isFrozen),
          betId: marketId,
          time: Date.now(),
        });
        updated = true;
      }
      if (away.id) {
        odds.save(PLATFORMS.Dex, {
          id: String(away.id),
          odds: Number(away.price ?? 0),
          isLock: locked || Boolean(away.isFrozen),
          betId: marketId,
          time: Date.now(),
        });
        updated = true;
      }
    }

    if (updated) {
      matchStore.refreshOddsOnBets();
    }
  };

  /** HTTP 轮询：全量快照写数据库（saveMatch + saveBets） */
  const runCycle = async () => {
    while (!collect.ready) {
      if (stopped) return;
      await wait(500);
    }

    const matches = [];
    const betsToSave: Array<{ matchId: string; bets: CollectBetDto[] }> = [];
    const winnerMarketIds: string[] = [];

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
              for (const b of bets) {
                if (b.SourceBetID) winnerMarketIds.push(b.SourceBetID);
              }
            }
          }
        }
      } catch (err) {
        console.warn(`[Dex] ${slug} failed`, err);
      }
    }

    if (winnerMarketIds.length) {
      subscribeDexMarkets(winnerMarketIds);
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
