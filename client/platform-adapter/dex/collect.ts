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
  DEX_SPORTSBOOK_API,
  dexSportSlugs,
  parseScheduleEvents,
  dexEventToMatch,
  parseMarketsToBets,
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
        const scheduleData = await dexPluginGet(
          tabId,
          `${DEX_SPORTSBOOK_API}/schedule/${slug}?locale=zh`,
        );
        const events = parseScheduleEvents(slug, scheduleData);

        for (const ev of events) {
          matches.push(dexEventToMatch(ev));

          try {
            const marketsData = await dexPluginGet(
              tabId,
              `${DEX_SPORTSBOOK_API}/events/${ev.id}/markets?locale=zh`,
            );
            const bets = parseMarketsToBets(ev.id, marketsData);
            if (bets.length) {
              betsToSave.push({ matchId: ev.id, bets });
            }
          } catch {
            // markets 请求失败不影响 match 采集
          }
        }
      } catch (err) {
        console.warn(`[Dex] ${slug} schedule failed`, err);
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
