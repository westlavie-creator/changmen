/**
 * [A8 可证实] 对齐 bundle `Vg` 内 `P()`：单主循环 — 拉列表门控、每轮 updateOdds、当场套利下单、补单、初赔门控。
 * 轮间 `wait(100ms)` 再调度（不用 `betInterval`）。
 */
import { useAccountStore } from "@/stores/accountStore";
import { runArbBetRound } from "@/stores/betting/runArbBetRound";
import { useBettingStore } from "@/stores/bettingStore";
import { useLoseOrderStore } from "@/stores/loseOrderStore";
import { useMatchStore } from "@/stores/matchStore";
import { useOddsStore } from "@/stores/oddsStore";
import { useUserStore } from "@/stores/userStore";
import { wait } from "@/shared/wait";

export const MAIN_LOOP_DELAY_MS = 100;
export const MATCH_POLL_MS = 30_000;
export const LOSE_ORDER_PRUNE_MS = 60_000;
export const DEFAULT_ODDS_MS = 10 * 60 * 1000;

export interface MainBetLoopState {
  lastLoseOrderPruneAt: number;
}

/** 单轮主循环体（不含 finally 调度） */
export async function runMainBetLoopTick(state: MainBetLoopState): Promise<void> {
  const user = useUserStore();
  const matchStore = useMatchStore();
  const loseStore = useLoseOrderStore();
  const oddsStore = useOddsStore();
  const bettingStore = useBettingStore();

  bettingStore.tickAutoOpen();
  if (!user.userId) return;

  const now = Date.now();

  if (now - matchStore.lastFetchAt >= MATCH_POLL_MS) {
    await matchStore.fetchMatches(true);
    oddsStore.clean();
    if (now - state.lastLoseOrderPruneAt >= LOSE_ORDER_PRUNE_MS) {
      loseStore.ensureOrdersMap();
      loseStore.removeOrders(matchStore.matchs.flatMap((m) => m.bets.map((b) => b.id)));
      state.lastLoseOrderPruneAt = now;
    }
  } else {
    matchStore.refreshOddsOnBets();
  }

  if (!matchStore.matchs.length) return;

  await runArbBetRound({
    setMessage: (m) => bettingStore.setMessage(m),
    processLoseOrders: () => bettingStore.processLoseOrders(),
  });

  if (now - matchStore.defaultOddsFetchedAt >= DEFAULT_ODDS_MS) {
    await matchStore.fetchMatchDefaultOdds();
  }
}

export async function runMainBetLoopFinally(): Promise<void> {
  const accountStore = useAccountStore();
  for (const acc of accountStore.accounts) {
    if (acc.active) acc.active = false;
  }
  await wait(MAIN_LOOP_DELAY_MS);
}
