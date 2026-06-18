import { detectOpportunities } from "@/extensions/arbOpportunity/detect";
import {
  diffOpportunities,
  snapshotOpportunities,
  type OpportunityTransition,
} from "@/extensions/arbOpportunity/state";
import type { ArbOpportunity, OpportunityKey } from "@/extensions/arbOpportunity/types";
import {
  enqueueKakaxiBet,
  removeKakaxiBet,
} from "@/stores/betting/kakaxi/queue";
import { useAccountStore } from "@/stores/accountStore";
import { useConfigStore } from "@/stores/configStore";
import { useMatchStore } from "@/stores/matchStore";
import { useOddsStore } from "@/stores/oddsStore";
import { useUserStore } from "@/stores/userStore";

export const KAKAXI_DETECT_DEBOUNCE_MS = 80;
export const KAKAXI_DETECT_FALLBACK_MS = 5_000;

function isBetLive(matchId: number, betId: number): boolean {
  const match = useMatchStore().matchs.find((m) => m.id === matchId);
  const bet = match?.bets.find((b) => b.id === betId);
  return Boolean(bet?.isLive);
}

export function applyKakaxiDetectTransitions(transitions: OpportunityTransition[]): void {
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
    removeKakaxiBet(transition.previous.matchId, transition.previous.betId);
  }
}

/** 单拍：funded detect → diff → 更新 kakaxi 队列 */
export function runKakaxiDetectFeedTick(
  snapshot: Map<OpportunityKey, ArbOpportunity>,
): Map<OpportunityKey, ArbOpportunity> {
  const user = useUserStore();
  const matchStore = useMatchStore();
  if (!user.userId || !matchStore.matchs.length) {
    return new Map();
  }

  const configStore = useConfigStore();
  const accountStore = useAccountStore();
  const current = detectOpportunities(
    {
      matches: matchStore.matchs,
      config: configStore.config,
      accounts: accountStore.accounts,
      actionablePlatforms: accountStore.getProviders().keys(),
    },
    "funded",
  );
  const transitions = diffOpportunities(snapshot, current);
  applyKakaxiDetectTransitions(transitions);
  return snapshotOpportunities(current);
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
      snapshot = runKakaxiDetectFeedTick(snapshot);
    }, KAKAXI_DETECT_DEBOUNCE_MS);
  };

  const oddsStore = useOddsStore();
  const unsubscribeOdds = oddsStore.$subscribe(() => {
    scheduleDebounced();
  });

  const fallbackInterval = setInterval(() => {
    snapshot = runKakaxiDetectFeedTick(snapshot);
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
