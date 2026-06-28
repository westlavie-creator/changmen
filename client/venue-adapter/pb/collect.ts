import { hasA8PluginRuntime } from "@/chrome-plugin/bridge";
import { getCollectPlatform } from "@/api/esport";
import { PB_PLUGIN_REQUIRED_MSG, pbCollectEuroOdds, resolvePbAccount } from "./transport";
import type { CollectBetDto, CollectMatchDto } from "@/types/collect";
import { PLATFORMS } from "@/shared/platform";
import { getStaticVenueGames } from "@/shared/venueGames";
import { parseEuroOddsPayload, slugify } from "./parse";
import { ingestAndReportPbParsedMatch } from "./markets";
import { wait } from "@/shared/wait";
import { notifyCollectError } from "@venue/shared/collectNotify";
import { useCollectStore } from "@/stores/collectStore";
import { useOddsStore } from "@/stores/oddsStore";
import { useMatchStore } from "@/stores/matchStore";

const PLATFORM = PLATFORMS.PB;
const POLL_MS = 5_000;
const SAVE_MS = 60_000;

export function startPbCollector(): () => void {
  let stopped = false;
  let lastSaveAt = 0;
  let pluginMissingNotified = false;

  const odds = useOddsStore();
  const collect = useCollectStore();
  const matchStore = useMatchStore();

  const poll = async () => {
    while (!stopped) {
      const started = Date.now();
      let matchCount = 0;
      try {
        const platform = await getCollectPlatform(PLATFORM);
        if (!platform) {
          await wait(POLL_MS);
          continue;
        }
        const games = getStaticVenueGames(PLATFORM);

        const account = resolvePbAccount();

        if (!account) {
          console.log(PLATFORM, "当前未检测到账号");
          odds.clean(PLATFORM);
          await wait(3_000);
          continue;
        }

        const pluginReady = hasA8PluginRuntime();
        if (!pluginReady) {
          if (!pluginMissingNotified) {
            notifyCollectError("PB", PB_PLUGIN_REQUIRED_MSG);
            pluginMissingNotified = true;
          }
          await wait(POLL_MS);
          continue;
        }
        pluginMissingNotified = false;

        const allowedSlugs = games.map(slugify);
        const data = await pbCollectEuroOdds(account, true);
        if (!data) {
          await wait(POLL_MS);
          continue;
        }
        const { matches } = parseEuroOddsPayload(data, { allowedSlugs });
        matchCount = matches.length;

        const shouldSave = Date.now() - lastSaveAt > SAVE_MS;
        const matchPayload: CollectMatchDto[] = [];
        const betsByMatch = new Map<string, CollectBetDto[]>();
        const now = Date.now();

        for (const row of matches) {
          const { match, bets } = ingestAndReportPbParsedMatch(row, now);
          matchPayload.push(match);
          betsByMatch.set(row.matchId, bets);
        }

        if (shouldSave && matchPayload.length) {
          const saved = await collect.saveMatch(PLATFORM, matchPayload);
          if (saved) {
            await Promise.all(
              [...betsByMatch.entries()]
                .filter(([, bets]) => bets.length)
                .map(([matchId, bets]) => collect.saveBets(PLATFORM, matchId, bets)),
            );
            lastSaveAt = Date.now();
          }
        }

        matchStore.refreshOddsOnBets();
      } catch (err) {
        console.warn("[PB] collect error", err);
        notifyCollectError("PB", err);
      } finally {
        console.debug(`[PB]比赛列表:${Date.now() - started}ms，读取比赛:${matchCount}场`);
        await wait(POLL_MS);
      }
    }
  };

  void poll();

  return () => {
    stopped = true;
  };
}
