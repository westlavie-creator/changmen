import { createA8BetsCollector } from "@/collectors/a8Bets";
import { getCollectPlatform } from "@/api/esport";
import { collectStakeGraphql } from "@/utils/collectHttp";
import { subscribeA8Channel } from "@/utils/a8SocketHub";
import type { A8BetsMessage } from "@/utils/a8BetsCollect";
import { STAKE_SPORT_SLUGS, normalizeGraphqlSport } from "@/utils/stakeCore";
import { PLATFORMS } from "@/utils/platform";
import { wait } from "@/utils/wait";
import { notifyCollectError } from "@/utils/collectNotify";
import { useCollectStore } from "@/stores/collectStore";
import { useMatchStore } from "@/stores/matchStore";

const POLL_MS = 60_000;
const SAVE_MS = 60_000;

/** 对齐 A8 PQ + StakeFeed — GraphQL 快照 + A8 聚合频道 Stake */
export function startStakeCollector(): () => void {
  let stopped = false;
  let lastSaveAt = 0;
  let lastGraphqlAt = 0;
  const unsubs: Array<() => void> = [];

  const acc = createA8BetsCollector({
    platform: PLATFORMS.Stake,
    homeSuffix: "1",
    awaySuffix: "2",
    useDirectIds: true,
  });

  const collect = useCollectStore();
  const matchStore = useMatchStore();

  void subscribeA8Channel("Stake", (msg) => {
    acc.ingest(msg as A8BetsMessage);
    matchStore.refreshOddsOnBets();
  }).then((unsub) => unsubs.push(unsub));

  const poll = async () => {
    while (!stopped) {
      try {
        if (!collect.isEnabled(PLATFORMS.Stake)) {
          await wait(5_000);
          continue;
        }

        if (Date.now() - lastGraphqlAt > POLL_MS) {
          const platform = await getCollectPlatform(PLATFORMS.Stake);
          const apiUrl = platform?.Gateway?.replace(/\/+$/, "") || "https://stake.com";
          const accessToken = platform?.Token;
          if (accessToken) {
            for (const slug of Object.keys(STAKE_SPORT_SLUGS)) {
              const data = await collectStakeGraphql<Record<string, unknown>>(
                apiUrl,
                accessToken,
                slug,
              );
              for (const row of normalizeGraphqlSport(slug, data)) {
                acc.mergeGraphqlMatch(row);
              }
            }
            lastGraphqlAt = Date.now();
          } else {
            console.warn("[Stake] GraphQL 跳过：无 accessToken");
          }
        }

        if (Date.now() - lastSaveAt > SAVE_MS) {
          const { matches, betsByMatch } = acc.buildPayload();
          if (matches.length) {
            const saved = await collect.saveMatch(PLATFORMS.Stake, matches);
            if (saved) {
              for (const [matchId, bets] of betsByMatch) {
                if (bets.length) await collect.saveBets(PLATFORMS.Stake, matchId, bets);
              }
              lastSaveAt = Date.now();
            }
          }
        }

        matchStore.refreshOddsOnBets();
      } catch (err) {
        console.warn("[Stake] collect error", err);
        notifyCollectError("Stake", err);
      }
      await wait(5_000);
    }
  };

  void poll();

  return () => {
    stopped = true;
    for (const unsub of unsubs) unsub();
  };
}
