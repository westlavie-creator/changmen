import { a8PluginSend, hasA8PluginRuntime } from "@changmen/client-core/chrome-plugin/bridge";
import type { CollectBetDto } from "@changmen/client-core/types/collect";
import { cleanStakeBets } from "./graphql";
import { collectStakeSportViaPlugin, stakeSportSlugs } from "./graphql";
import { applyStakeLiveOdds } from "./liveOdds";
import { subscribeStakeOddsPush } from "./oddsPush";
import { getStakeTabIdCached, setStakeTabIdCached, stakeTabIdHint, waitForStakeTabId } from "./tabId";
import { PLATFORMS } from "../shared/platforms";
import { wait } from "@changmen/client-core/shared/wait";
import { notifyCollectError } from "../shared/collectNotify";
import { useCollectStore } from "../shared/webBridge";
import { useMatchStore } from "../shared/webBridge";

const LOOP_MS = 30_000;

/** 对齐 A8 `LHe` / `n2[Stake]` */
function registerStakeOddsHandler(matchStore: ReturnType<typeof useMatchStore>) {
  return subscribeStakeOddsPush((msg) => {
    applyStakeLiveOdds(msg);
    matchStore.refreshOddsOnBets();
  });
}

/** 对齐 A8 `oZ` / `MQ` — GraphQL 快照（插件 tabId）+ 插件 WS 增量写 fo */
export function startStakeCollector(): () => void {
  let stopped = false;
  let socketRegistered = false;
  const unsubs: Array<() => void> = [];

  const collect = useCollectStore();
  const matchStore = useMatchStore();

  const runCycle = async () => {
    while (!collect.ready) {
      if (stopped) return;
      await wait(500);
    }

    if (!socketRegistered) {
      unsubs.push(registerStakeOddsHandler(matchStore));
      socketRegistered = true;
    }

    if (!hasA8PluginRuntime()) {
      notifyCollectError("Stake", stakeTabIdHint());
      return;
    }

    let tabId = getStakeTabIdCached();
    if (!tabId) {
      tabId = await waitForStakeTabId();
    }
    if (!tabId) {
      notifyCollectError("Stake", stakeTabIdHint());
      return;
    }

    const matches = [];
    const subscribe: Array<{ id: string; slug: string }> = [];
    const betsToSave: Array<{ matchId: string | number; bets: CollectBetDto[] }> = [];

    for (const slug of stakeSportSlugs()) {
      const { rows, subscribe: subRows } = await collectStakeSportViaPlugin(tabId, slug);
      for (const row of rows) {
        matches.push(row.match);
        applyStakeLiveOdds(row.ingestMessage);
        betsToSave.push({ matchId: row.match.SourceMatchID, bets: row.bets });
      }
      subscribe.push(...subRows);
    }

    // [A8 可证实] oZ：空 e 仍 saveMatch，再 bf.clean(e)
    await collect.saveMatch(PLATFORMS.Stake, matches);
    for (const { matchId, bets } of betsToSave) {
      await collect.saveBets(PLATFORMS.Stake, matchId, bets);
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
