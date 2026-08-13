import { cleanVenueOdds } from "@changmen/client-core/bridge/oddsAccess";
import { hasA8PluginRuntime } from "@changmen/client-core/chrome-plugin/bridge";
import { getCollectPlatform, getGames } from "@changmen/client-core/bridge/clientApi";
import { getStaticVenueGames } from "@changmen/client-core/shared/venueGames";
import { PB_PLUGIN_REQUIRED_MSG, pbCollectEuroOdds, resolvePbAccount } from "./transport";
import type { CollectBetDto, CollectMatchDto } from "@changmen/client-core/types/collect";
import type { PlatformAccount } from "@changmen/client-core/models/platformAccount";
import { PLATFORMS } from "../shared/platforms";
import { mergeEuroOddsPayloads, parseEuroOddsPayload } from "./parse";
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

/**
 * [changmen 扩展] A8 `mHe` 只拉 isLive=true；此处并行拉 live + prematch 再合并，
 * 同 event.id 时后写入优先，故 live 放最后。
 * 单侧失败时仍用另一侧，避免 Promise.all 整轮落空。
 */
async function fetchPbEuroOddsMerged(
  account: PlatformAccount,
): Promise<Record<string, unknown> | undefined> {
  const settled = await Promise.allSettled([
    pbCollectEuroOdds(account, true),
    pbCollectEuroOdds(account, false),
  ]);
  const liveData = settled[0].status === "fulfilled" ? settled[0].value : undefined;
  const prematchData = settled[1].status === "fulfilled" ? settled[1].value : undefined;
  if (settled[0].status === "rejected") {
    console.warn("[PB] euro/odds live failed", settled[0].reason);
  }
  if (settled[1].status === "rejected") {
    console.warn("[PB] euro/odds prematch failed", settled[1].reason);
  }
  const payloads = [prematchData, liveData].filter(
    (p): p is Record<string, unknown> => p != null,
  );
  if (!payloads.length) return undefined;
  return mergeEuroOddsPayloads(...payloads);
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

        // [changmen 扩展] live + prematch；解析全部联赛后再按 games 过滤
        const data = await fetchPbEuroOddsMerged(account);
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
