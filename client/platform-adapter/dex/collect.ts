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

  /** WS 推送：赢家盘口写 oddsStore（UI 实时更新）+ saveBets（持久化地图赔率） */
  const handleBatch = (items: DexBatchItem[]) => {
    if (!collect.ready || !collect.collect.get(PLATFORMS.Dex)) return;

    let updated = false;
    const betsToSave: Array<{ matchId: string; bets: CollectBetDto[] }> = [];

    for (const item of items) {
      if (item.model !== "market") continue;
      const mkt = item.data;
      const name = String(mkt.name ?? "");
      if (!/winner|赢家|获胜/i.test(name)) continue;
      const outcomes = (mkt.outcomes ?? []) as Array<Record<string, unknown>>;
      if (outcomes.length < 1 || outcomes.length > 3) continue;

      const marketId = String(mkt.id ?? "");
      const eventLid = String(mkt.pid ?? "");
      const eventId = eventLid.split(".").pop() || eventLid;
      const map = parseMapFromMarketName(name);

      for (const o of outcomes) {
        if (!o.id) continue;
        const frozen = Boolean(o.isFrozen);
        odds.save(PLATFORMS.Dex, {
          id: String(o.id),
          odds: !frozen ? Number(o.price ?? 0) : 0,
          isLock: frozen,
          betId: marketId,
          time: Date.now(),
        });
        updated = true;
      }

      if (eventId && outcomes.length === 2) {
        const home = outcomes[0]!;
        const away = outcomes[1]!;
        const locked = Boolean(home.isFrozen) && Boolean(away.isFrozen);
        betsToSave.push({
          matchId: eventId,
          bets: [{
            Type: PLATFORMS.Dex,
            SourceMatchID: eventId,
            Map: map,
            SourceBetID: marketId,
            BetName: name,
            SourceHomeID: String(home.id ?? ""),
            HomeName: String(home.name ?? ""),
            HomeOdds: !Boolean(home.isFrozen) ? Number(home.price ?? 0) : 0,
            SourceAwayID: String(away.id ?? ""),
            AwayName: String(away.name ?? ""),
            AwayOdds: !Boolean(away.isFrozen) ? Number(away.price ?? 0) : 0,
            Status: locked ? "Locked" : "Normal",
          }],
        });
      }

    if (updated) {
      matchStore.refreshOddsOnBets();
    }

    for (const { matchId, bets } of betsToSave) {
      if (bets.length) void collect.saveBets(PLATFORMS.Dex, matchId, bets);
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

    for (const { bets } of betsToSave) {
      for (const b of bets) {
        const locked = b.Status === "Locked";
        if (b.SourceHomeID) {
          odds.save(PLATFORMS.Dex, {
            id: b.SourceHomeID,
            odds: b.HomeOdds,
            isLock: locked,
            betId: b.SourceBetID,
            time: Date.now(),
          });
        }
        if (b.SourceAwayID) {
          odds.save(PLATFORMS.Dex, {
            id: b.SourceAwayID,
            odds: b.AwayOdds,
            isLock: locked,
            betId: b.SourceBetID,
            time: Date.now(),
          });
        }
      }
    }
    matchStore.refreshOddsOnBets();
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
