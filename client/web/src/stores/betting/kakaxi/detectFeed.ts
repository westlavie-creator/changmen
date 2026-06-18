import {
  detectOpportunities,
  detectOpportunitiesForBets,
} from "@/extensions/arbOpportunity/detect";
import type { ArbOpportunity, OpportunityKey } from "@/extensions/arbOpportunity/types";
import { opportunityKey } from "@/extensions/arbOpportunity/types";
import {
  KAKAXI_DETECT_DEBOUNCE_MS,
  KAKAXI_DETECT_FALLBACK_MS,
} from "@/stores/betting/kakaxi/config";
import {
  collectDirtyBetAnchorsFromFlash,
  shouldRunFullKakaxiDetect,
} from "@/stores/betting/kakaxi/incrementalDetect";
import {
  diffKakaxiOpportunities,
  snapshotKakaxiOpportunities,
  type KakaxiOpportunityTransition,
} from "@/stores/betting/kakaxi/opportunityDiff";
import {
  boostKakaxiBetImplied,
  enqueueKakaxiBet,
  removeKakaxiBet,
} from "@/stores/betting/kakaxi/queue";
import { useAccountStore } from "@/stores/accountStore";
import { useConfigStore } from "@/stores/configStore";
import { useMatchStore } from "@/stores/matchStore";
import { useOddsStore } from "@/stores/oddsStore";
import { useUserStore } from "@/stores/userStore";

export { KAKAXI_DETECT_DEBOUNCE_MS, KAKAXI_DETECT_FALLBACK_MS };

function betAnchorFromOpportunityKey(key: OpportunityKey): string {
  const parts = key.split(":");
  return `${parts[0]}:${parts[1]}`;
}

/** 增量 detect 时只替换受影响盘口的快照条目，避免误报 gone */
export function mergeIncrementalKakaxiSnapshot(
  previous: Map<OpportunityKey, ArbOpportunity>,
  partial: ArbOpportunity[],
  dirtyAnchors: Set<string>,
): Map<OpportunityKey, ArbOpportunity> {
  const next = new Map(previous);
  for (const key of [...next.keys()]) {
    if (dirtyAnchors.has(betAnchorFromOpportunityKey(key))) {
      next.delete(key);
    }
  }
  for (const opp of partial) {
    next.set(opportunityKey(opp), opp);
  }
  return next;
}

function isBetLive(matchId: number, betId: number): boolean {
  const match = useMatchStore().matchs.find((m) => m.id === matchId);
  const bet = match?.bets.find((b) => b.id === betId);
  return Boolean(bet?.isLive);
}

export function applyKakaxiDetectTransitions(
  transitions: KakaxiOpportunityTransition[],
): void {
  for (const transition of transitions) {
    if (transition.kind === "appeared") {
      const opp = transition.opportunity;
      enqueueKakaxiBet({
        matchId: opp.matchId,
        betId: opp.betId,
        enqueuedAt: Date.now(),
        implied: opp.implied,
        isLive: isBetLive(opp.matchId, opp.betId),
      });
      continue;
    }
    if (transition.kind === "improved") {
      const opp = transition.opportunity;
      const boosted = boostKakaxiBetImplied(
        opp.matchId,
        opp.betId,
        opp.implied,
        isBetLive(opp.matchId, opp.betId),
      );
      if (!boosted) {
        enqueueKakaxiBet({
          matchId: opp.matchId,
          betId: opp.betId,
          enqueuedAt: Date.now(),
          implied: opp.implied,
          isLive: isBetLive(opp.matchId, opp.betId),
        });
      }
      continue;
    }
    removeKakaxiBet(transition.previous.matchId, transition.previous.betId);
  }
}

export type KakaxiDetectMode = "incremental" | "full";

/** 单拍：funded detect（可增量）→ kakaxi diff → 更新队列 */
export function runKakaxiDetectFeedTick(
  snapshot: Map<OpportunityKey, ArbOpportunity>,
  mode: KakaxiDetectMode = "incremental",
): Map<OpportunityKey, ArbOpportunity> {
  const user = useUserStore();
  const matchStore = useMatchStore();
  if (!user.userId || !matchStore.matchs.length) {
    return new Map();
  }

  const dirtyAnchors = collectDirtyBetAnchorsFromFlash(matchStore.matchs);
  if (!shouldRunFullKakaxiDetect(mode, dirtyAnchors)) {
    return snapshot;
  }

  const configStore = useConfigStore();
  const accountStore = useAccountStore();
  const detectParams = {
    matches: matchStore.matchs,
    config: configStore.config,
    accounts: accountStore.accounts,
    actionablePlatforms: accountStore.getProviders().keys(),
  };

  let nextSnapshot: Map<OpportunityKey, ArbOpportunity>;
  let diffBase: ArbOpportunity[];

  if (mode === "full") {
    diffBase = detectOpportunities(detectParams, "funded");
    nextSnapshot = snapshotKakaxiOpportunities(diffBase);
  } else {
    const partial = detectOpportunitiesForBets(detectParams, "funded", dirtyAnchors);
    nextSnapshot = mergeIncrementalKakaxiSnapshot(snapshot, partial, dirtyAnchors);
    diffBase = [...nextSnapshot.values()];
  }

  const transitions = diffKakaxiOpportunities(snapshot, diffBase);
  applyKakaxiDetectTransitions(transitions);
  return nextSnapshot;
}

let activeFeed: { stop: () => void } | null = null;

/** 赔率事件驱动 funded detect，有机会入 kakaxi 队列 */
export function startKakaxiDetectFeed(): void {
  stopKakaxiDetectFeed();

  let snapshot = new Map<OpportunityKey, ArbOpportunity>();
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const scheduleDebounced = () => {
    if (stopped) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = undefined;
      snapshot = runKakaxiDetectFeedTick(snapshot, "incremental");
    }, KAKAXI_DETECT_DEBOUNCE_MS);
  };

  const oddsStore = useOddsStore();
  const unsubscribeOdds = oddsStore.$subscribe(() => {
    scheduleDebounced();
  });

  const fallbackInterval = setInterval(() => {
    snapshot = runKakaxiDetectFeedTick(snapshot, "full");
  }, KAKAXI_DETECT_FALLBACK_MS);
  scheduleDebounced();

  activeFeed = {
    stop: () => {
      stopped = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      clearInterval(fallbackInterval);
      unsubscribeOdds();
      snapshot = new Map();
      activeFeed = null;
    },
  };
}

export function stopKakaxiDetectFeed(): void {
  activeFeed?.stop();
}
