import { cleanVenueOdds } from "@changmen/client-core/bridge/oddsAccess";
import { hasA8PluginRuntime } from "@changmen/client-core/chrome-plugin/bridge";
import { getCollectPlatform, getGames } from "@changmen/client-core/bridge/clientApi";
import { getStaticVenueGames } from "@changmen/client-core/shared/venueGames";
import { PB_PLUGIN_REQUIRED_MSG, pbCollectEuroOdds, resolvePbAccount } from "./transport";
import type { CollectBetDto, CollectMatchDto } from "@changmen/client-core/types/collect";
import { PLATFORMS } from "../shared/platforms";
import { parseEuroOddsPayload } from "./parse";
import { isPbAllowedSourceGameId } from "./gameFilter";
import { ingestAndReportPbParsedMatch } from "./markets";
import { wait } from "@changmen/client-core/shared/wait";
import { notifyCollectError } from "../shared/collectNotify";
import { useCollectStore } from "../shared/webBridge";

import { useMatchStore } from "../shared/webBridge";

const PLATFORM = PLATFORMS.PB;
const POLL_MS = 5_000;
const SAVE_MS = 60_000;

/** Client_GetGames 失败/空时回退静态表，避免整轮过滤成 0 场 */
async function resolvePbPlatformGames(): Promise<string[]> {
  try {
    const games = await getGames(PLATFORM);
    if (games.length) return games;
  } catch (err) {
    console.warn("[PB] getGames failed, fallback to static venue games", err);
  }
  return getStaticVenueGames(PLATFORM);
}

export function startPbCollector(): () => void {
  let stopped = false;
  let lastSaveAt = 0;
  let pluginMissingNotified = false;
  const collect = useCollectStore();
  const matchStore = useMatchStore();

  const poll = async () => {
    while (!stopped) {
      const started = Date.now();
      let matchCount = 0;
      try {
        // [A8 可证实] YY：先 Ut.getPlatform(PB)，无则 return
        const platform = await getCollectPlatform(PLATFORM);
        if (!platform) {
          await wait(POLL_MS);
          continue;
        }
        // [A8 可证实] YY：e.games；changmen 经 Client_GetGames（catalog ∪ platforms.json）
        const games = await resolvePbPlatformGames();

        const account = resolvePbAccount();

        if (!account) {
          console.log(PLATFORM, "当前未检测到账号");
          cleanVenueOdds(PLATFORM);
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

        // [A8 可证实] mHe：只拉 isLive=true；解析全部联赛后再按 games 过滤
        const data = await pbCollectEuroOdds(account, true);
        if (!data) {
          await wait(POLL_MS);
          continue;
        }
        const { matches: parsed } = parseEuroOddsPayload(data);
        const matches = parsed.filter((row) => isPbAllowedSourceGameId(row.gameId, games));
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

        if (shouldSave) {
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
