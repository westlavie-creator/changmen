import { createA8BetsCollector } from "@/collectors/a8";
import { a8PluginSend } from "@/collectors/a8/pluginBridge";
import { subscribeA8Channel } from "@/collectors/a8/socketHub";
import type { A8BetsMessage } from "@/collectors/a8/betsCollect";
import type { CollectBetDto } from "@/types/collect";
import { cleanStakeBets } from "@/collectors/stake/betsMerge";
import { collectStakeSportViaPlugin, stakeSportSlugs } from "@/collectors/stake/graphqlCollect";
import { getStakeTabIdCached, setStakeTabIdCached, waitForStakeTabId } from "@/collectors/stake/tabId";
import { PLATFORMS } from "@/shared/platform";
import { wait } from "@/shared/wait";
import { notifyCollectError } from "@/collectors/shared/collectNotify";
import { useCollectStore } from "@/stores/collectStore";
import { useMatchStore } from "@/stores/matchStore";

const LOOP_MS = 30_000;

/** 对齐 A8 `ZZe` — Socket 频道 Stake 只更新已有 outcome 赔率 */
function registerStakeSocketHandler(
  acc: ReturnType<typeof createA8BetsCollector>,
  matchStore: ReturnType<typeof useMatchStore>,
) {
  return subscribeA8Channel("Stake", (msg) => {
    acc.ingest(msg as A8BetsMessage);
    matchStore.refreshOddsOnBets();
  });
}

/** 对齐 A8 `MQ` — GraphQL 快照（插件 tabId）+ A8 聚合频道 Stake */
export function startStakeCollector(): () => void {
  let stopped = false;
  let socketRegistered = false;
  const unsubs: Array<() => void> = [];

  const acc = createA8BetsCollector({
    platform: PLATFORMS.Stake,
    homeSuffix: "1",
    awaySuffix: "2",
    useDirectIds: true,
  });

  const collect = useCollectStore();
  const matchStore = useMatchStore();

  const runCycle = async () => {
    while (!collect.ready) {
      if (stopped) return;
      await wait(500);
    }

    if (!socketRegistered) {
      const unsub = await registerStakeSocketHandler(acc, matchStore);
      unsubs.push(unsub);
      socketRegistered = true;
    }

    let tabId = getStakeTabIdCached();
    if (!tabId) {
      tabId = await waitForStakeTabId();
    }
    if (!tabId) return;

    if (!collect.isEnabled(PLATFORMS.Stake)) return;

    const matches = [];
    const subscribe: Array<{ id: string; slug: string }> = [];
    const betsToSave: Array<{ matchId: string | number; bets: CollectBetDto[] }> = [];

    for (const slug of stakeSportSlugs()) {
      const { rows, subscribe: subRows } = await collectStakeSportViaPlugin(tabId, slug);
      for (const row of rows) {
        matches.push(row.match);
        acc.ingest(row.ingestMessage);
        betsToSave.push({ matchId: row.match.SourceMatchID, bets: row.bets });
      }
      subscribe.push(...subRows);
    }

    if (matches.length) {
      await collect.saveMatch(PLATFORMS.Stake, matches);
      for (const { matchId, bets } of betsToSave) {
        if (bets.length) await collect.saveBets(PLATFORMS.Stake, matchId, bets);
      }
    }

    if (subscribe.length) {
      void a8PluginSend({
        type: "",
        data: subscribe,
        options: { tabId },
      }).catch((err) => console.warn("[Stake] 插件订阅跳过", err));
    }

    cleanStakeBets(matches);
    matchStore.refreshOddsOnBets();
  };

  const loop = async () => {
    while (!stopped) {
      try {
        await runCycle();
      } catch (err) {
        console.warn("[Stake] collect error", err);
        notifyCollectError("Stake", err);
        setStakeTabIdCached(undefined);
      }
      await wait(LOOP_MS);
    }
  };

  void loop();

  return () => {
    stopped = true;
    for (const unsub of unsubs) unsub();
  };
}
