import { PLATFORMS } from "@/shared/platform";
import { wait } from "@/shared/wait";
import { notifyCollectError } from "@platform/shared/collectNotify";
import { useCollectStore } from "@/stores/collectStore";
import {
  getDexTabId,
  isDexPluginAvailable,
  dexPluginGet,
} from "./pluginApi";
import {
  DEX_LINE_API,
  DEX_CID,
  dexSportSlugs,
  parseTopEvents,
  dexEventToMatch,
  parseInlineMarkets,
} from "./parse";
import type { CollectBetDto } from "@/types/collect";

const LOOP_MS = 30_000;

export function startDexCollector(): () => void {
  let stopped = false;

  const collect = useCollectStore();

  const runCycle = async () => {
    while (!collect.ready) {
      if (stopped) return;
      await wait(500);
    }

    if (!isDexPluginAvailable()) {
      notifyCollectError("Dex", "未安装 Gamebet 扩展；DexSport 采集需在浏览器打开 dexsport.io");
      return;
    }

    const tabId = await getDexTabId();
    if (!tabId) {
      notifyCollectError("Dex", "未找到 DexSport 标签页：请先在浏览器打开 dexsport.io 并登录");
      return;
    }

    const matches = [];
    const betsToSave: Array<{ matchId: string; bets: CollectBetDto[] }> = [];

    for (const slug of dexSportSlugs()) {
      try {
        const url = `${DEX_LINE_API}/top-events/${slug}?cid=${DEX_CID}&locale=zh`;
        const rawData = await dexPluginGet<{ data?: unknown[] }>(tabId, url);
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
  };
}
