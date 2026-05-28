import { getCollectPlatform, getGames } from "@/api/esport";
import { getObBetNameRe } from "@/collectors/ob/betNameRe";
import { collectObGet } from "@/collectors/ob/http";
import { PLATFORMS } from "@/shared/platform";
import { wait } from "@/shared/wait";
import { notifyCollectError } from "@/collectors/shared/collectNotify";
import { runPool } from "@/collectors/shared/runPool";
import {
  ensureObTeamLogosLoaded,
  refreshObCollectToken,
  syncObLiveTimer,
} from "@/collectors/ob/helpers";
import { teamsFromListRow } from "@/collectors/ob/matches";
import { loadMarketsForMatch, maxStageFromBo } from "@/collectors/ob/markets";
import {
  connectObMqtt,
  disconnectObMqtt,
  subscribeObMatchAfterView,
  unsubscribeObMatchBeforeView,
} from "@/collectors/ob/mqtt";
import { num } from "@/collectors/ob/parse";
import { useCollectStore } from "@/stores/collectStore";
import { useMatchStore } from "@/stores/matchStore";

const PLATFORM = PLATFORMS.OB;
const POLL_MS = 30_000;
/** 多场并行灌盘；单场内部仍顺序 stage + 1.5s（对齐 A8 语义） */
const MATCH_LOAD_CONCURRENCY = 4;

export function startObCollector(): () => void {
  let stopped = false;
  let loopPromise: Promise<void> | null = null;

  const collect = useCollectStore();
  const matchStore = useMatchStore();

  const poll = async () => {
    while (!stopped) {
      const started = Date.now();
      let matchCount = 0;
      try {
        let [platform, games] = await Promise.all([
          getCollectPlatform(PLATFORM),
          getGames(PLATFORM),
        ]);
        if (!platform?.Gateway) {
          await wait(POLL_MS);
          continue;
        }

        const betRe = getObBetNameRe(platform.BetName);

        const index = await collectObGet<{ status: string; data?: Array<Record<string, unknown>> | string }>(
          platform,
          "game/index",
          "game_id=0&flag=1&day=1",
        );
        if (index.status === "false") {
          if (index.data === "token") {
            const token = await refreshObCollectToken();
            if (token) platform = { ...platform, Token: token };
          }
          await wait(POLL_MS);
          continue;
        }

        const rawList = (index.data ?? []) as Array<Record<string, unknown>>;
        const horizon = Date.now() / 1000 + 3600;
        const list = rawList.filter((row) => {
          const gid = String(row.game_id ?? "");
          return games.includes(gid) && num(row.start_time) < horizon;
        });

        await ensureObTeamLogosLoaded();
        // 比赛列表由后端 FeedHub + ESPORT_BRIDGE 写入 matches.json；此处只灌盘/上报赔率。
        if (!list.length) {
          await wait(POLL_MS);
          continue;
        }

        await runPool(list, MATCH_LOAD_CONCURRENCY, async (row) => {
          if (stopped) return;
          const matchId = String(row.id ?? "");
          if (!matchId) return;
          matchCount += 1;

          unsubscribeObMatchBeforeView(matchId);
          const loaded = await loadMarketsForMatch(
            platform,
            matchId,
            maxStageFromBo(row.bo),
            betRe,
            teamsFromListRow(row),
          );
          if (loaded.bets.length && !loaded.hadError) {
            await collect.saveBets(PLATFORM, matchId, loaded.bets);
          }
          await subscribeObMatchAfterView(matchId);
        });

        await syncObLiveTimer(platform);
        await matchStore.fetchMatches(true);
      } catch (err) {
        console.warn("[OB] collect error", err);
        notifyCollectError("OB", err);
      } finally {
        console.debug(`[OB]比赛列表:${Date.now() - started}ms，读取比赛:${matchCount}场`);
        await wait(POLL_MS);
      }
    }
  };

  void (async () => {
    await wait(3000);
    if (stopped) return;
    connectObMqtt(() => matchStore.refreshOddsOnBets());
    loopPromise = poll();
  })();

  return () => {
    stopped = true;
    disconnectObMqtt();
    void loopPromise;
  };
}
